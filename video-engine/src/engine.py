import os
import time
import subprocess
import logging
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from logging.handlers import TimedRotatingFileHandler
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from supabase import create_client, Client

# --- CONFIGURATION ---
BASE_DIR = os.getenv("BASE_DIR", "/videos")
WATCH_DIR = os.getenv("WATCH_DIR", os.path.join(BASE_DIR, "input"))
OUTPUT_DIR = os.getenv("OUTPUT_DIR", os.path.join(BASE_DIR, "hls"))
LOG_DIR = os.getenv("LOG_DIR", os.path.join(BASE_DIR, "logs"))
ERROR_DIR = os.getenv("ERROR_DIR", os.path.join(BASE_DIR, "errors"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
BASE_URL = os.getenv("BASE_URL")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase credentials")
if not BASE_URL:
    raise ValueError("Missing BASE_URL")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Thread pool for concurrent transcoding jobs
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "3"))
executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)

# Thread-safe tracker to prevent duplicate processing
PROCESSING_FILES = set()
VALID_EXTENSIONS = (".mp4", ".mov", ".mkv", ".avi")

for folder in [WATCH_DIR, OUTPUT_DIR, LOG_DIR, ERROR_DIR]:
    os.makedirs(folder, exist_ok=True)

# --- LOGGING ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(threadName)s] %(levelname)s - %(message)s',
    handlers=[
        TimedRotatingFileHandler(os.path.join(LOG_DIR, "engine.log"), when="midnight", interval=1, backupCount=7),
        logging.StreamHandler()
    ]
)

# --- HELPERS ---
def generate_slug(text):
    text = os.path.splitext(text)[0]
    text = re.sub(r'[^\w\s-]', '', text).strip()
    text = re.sub(r'[-\s_]+', '-', text)
    return text.lower()

def wait_for_file_complete(path, check_interval=5, stability_time=15):
    logging.info(f"⏳ Monitoring upload stability: {os.path.basename(path)}")
    stable_count_required = max(1, stability_time // check_interval)
    stable_count = 0
    prev_size = -1

    while True:
        try:
            if not os.path.exists(path):
                return False
            current_size = os.path.getsize(path)
            if current_size != prev_size or current_size == 0:
                prev_size = current_size
                stable_count = 0
            else:
                stable_count += 1
                if stable_count >= stable_count_required:
                    return True
        except OSError:
            stable_count = 0
        time.sleep(check_interval)

def update_supabase_status(slug, video_id, raw_filename, status):
    display_title = raw_filename.replace("_", " ").split(".")[0]
    base_url = f"{BASE_URL}/{video_id}"
    video_data = {
        "title": display_title,
        "slug": slug,
        "master_url": f"{base_url}/master.m3u8",
        "thumb_url": f"{base_url}/thumb.jpg",
        "status": status
    }
    try:
        supabase.table("videos").upsert(video_data, on_conflict="slug").execute()
        logging.info(f"🚀 Supabase status set to '{status}' for {slug}")
    except Exception as e:
        logging.error(f"❌ Supabase Sync Failed for {slug}: {e}")

# --- JOB DISPATCHER ---
def handle_video_pipeline(input_path):
    filename = os.path.basename(input_path)
    
    if input_path in PROCESSING_FILES:
        return
    PROCESSING_FILES.add(input_path)

    try:
        if not wait_for_file_complete(input_path):
            logging.error(f"❌ File upload tracking lost/aborted: {filename}")
            return

        # Start Processing
        video_id = str(uuid.uuid4())
        video_folder = os.path.join(OUTPUT_DIR, video_id)
        slug = generate_slug(filename)
        os.makedirs(video_folder, exist_ok=True)

        # Enhancement: Initialize DB record early
        update_supabase_status(slug, video_id, filename, "processing")

        # --- THUMBNAIL ---
        logging.info(f"📸 Generating thumbnail for {video_id}")
        subprocess.run([
            'ffmpeg', '-y', '-ss', '00:00:05', '-i', input_path,
            '-vframes', '1', '-q:v', '2', os.path.join(video_folder, "thumb.jpg")
        ], check=True)

        # --- TRANSCODING ---
        logging.info(f"⚙️ Starting HLS transcoding for {video_id}")
        # Optimized: Dynamic CPU thread utilization
        cpu_cores = str(max(1, (os.cpu_count() or 4) // 2)) 
        
        cmd = [
    'ffmpeg', '-y', '-i', input_path,
    '-threads', cpu_cores,
    
    # 1. Split and scale into 2 outputs
    '-filter_complex', '[0:v]split=2[v1][v2];[v1]scale=640:360[v1out];[v2]scale=1280:720[v2out]',
    
    # 2. Map 2 video variations and their audio streams
    '-map', '[v1out]', '-map', '0:a',
    '-map', '[v2out]', '-map', '0:a',

    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-g', '48', '-keyint_min', '48', '-sc_threshold', '0',
    '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod',
    # ENHANCEMENT: Place variant segments into clear variant subfolders
    '-hls_segment_filename', os.path.join(video_folder, 'stream_%v', 'data%03d.ts'),
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', 'v:0,a:0 v:1,a:1',

    # ENHANCEMENT: Put variant m3u8 manifests inside matching variant subfolders
    os.path.join(video_folder, 'stream_%v', 'manifest.m3u8')
]
        
        subprocess.run(cmd, check=True)
        logging.info(f"✅ Transcode complete: {video_id}")
        
        update_supabase_status(slug, video_id, filename, "ready")
        
        # Cleanup input file upon success
        try:
            os.remove(input_path)
            logging.info(f"🗑️ Cleaned up input raw file: {filename}")
        except Exception as e:
            logging.warning(f"⚠️ Could not delete input file {filename}: {e}")

    except Exception as e:
        logging.error(f"❌ Critical Failure processing {filename}: {e}")
        try:
            update_supabase_status(generate_slug(filename), str(uuid.uuid4()), filename, "failed")
            os.rename(input_path, os.path.join(ERROR_DIR, filename))
        except Exception as rename_err:
            logging.critical(f"💀 Failed to move file to error directory: {rename_err}")
    finally:
        PROCESSING_FILES.discard(input_path)

# --- WATCHDOG HANDLER ---
class VideoHandler(FileSystemEventHandler):
    def on_created(self, event):
        if not event.is_directory and event.src_path.lower().endswith(VALID_EXTENSIONS):
            logging.info(f"✨ Event detected: {os.path.basename(event.src_path)}")
            # Offload to background worker thread immediately
            executor.submit(handle_video_pipeline, event.src_path)

def scan_existing_files():
    logging.info("🔍 Scanning directory for missed or leftover files...")
    for entry in os.scandir(WATCH_DIR):
        if entry.is_file() and entry.path.lower().endswith(VALID_EXTENSIONS):
            logging.info(f"📂 Found existing file on startup: {entry.name}")
            executor.submit(handle_video_pipeline, entry.path)

if __name__ == "__main__":
    logging.info(f"🚀 Engine initialized. Watching: {WATCH_DIR}")
    
    # Run historical startup scan before listening live
    scan_existing_files()

    event_handler = VideoHandler()
    observer = Observer()
    observer.schedule(event_handler, WATCH_DIR, recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logging.info("Shutting down engine...")
        observer.stop()
        executor.shutdown(wait=True)
    observer.join()
