import os
import time
import subprocess
import logging
import re
import uuid
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

# Ensure directories exist
for folder in [WATCH_DIR, OUTPUT_DIR, LOG_DIR, ERROR_DIR]:
    os.makedirs(folder, exist_ok=True)

# --- LOGGING ---

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        TimedRotatingFileHandler(
            os.path.join(LOG_DIR, "engine.log"),
            when="midnight",
            interval=1,
            backupCount=7
        ),
        logging.StreamHandler()
    ]
)

# --- HELPERS ---

def generate_slug(text):
    text = os.path.splitext(text)[0]
    text = re.sub(r'[^\w\s-]', '', text).strip()
    text = re.sub(r'[-\s_]+', '-', text)
    return text.lower()

def wait_for_file_complete(path, timeout=30):
    prev_size = -1
    for _ in range(timeout):
        size = os.path.getsize(path)
        if size == prev_size:
            return True
        prev_size = size
        time.sleep(1)
    return False

def register_video_to_supabase(video_id, raw_filename):
    display_title = raw_filename.replace("_", " ").split(".")[0]
    slug = generate_slug(raw_filename)

    base_url = f"{BASE_URL}/{video_id}"

    video_data = {
        "title": display_title,
        "slug": slug,
        "master_url": f"{base_url}/master.m3u8",
        "thumb_url": f"{base_url}/thumb.jpg",
        "status": "ready"
    }

    try:
        supabase.table("videos").upsert(video_data, on_conflict="slug").execute()
        logging.info(f"🚀 Registered in Supabase: {slug}")
    except Exception as e:
        logging.error(f"❌ Supabase Sync Failed: {e}")

# --- CORE ENGINE ---

class VideoHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return

        valid_extensions = (".mp4", ".mov", ".mkv", ".avi")

        if event.src_path.lower().endswith(valid_extensions):
            filename = os.path.basename(event.src_path)
            logging.info(f"✨ New file detected: {filename}")

            if not wait_for_file_complete(event.src_path):
                logging.error(f"❌ File not stable: {filename}")
                return

            self.process_video(event.src_path)

    def process_video(self, input_path, attempt=1):
        max_retries = 3
        filename = os.path.basename(input_path)
        video_id = str(uuid.uuid4())
        video_folder = os.path.join(OUTPUT_DIR, video_id)

        try:
            os.makedirs(video_folder, exist_ok=True)

            # --- THUMBNAIL ---
            logging.info(f"📸 Generating thumbnail for {video_id}")
            subprocess.run([
                'ffmpeg', '-y', '-ss', '00:00:05', '-i', input_path,
                '-vframes', '1', '-q:v', '2',
                os.path.join(video_folder, "thumb.jpg")
            ], check=True)

            # --- OPTIMIZED HLS TRANSCODING ---
            logging.info(f"⚙️ Starting optimized transcoding for {video_id}")

            cmd = [
                'ffmpeg', '-y', '-i', input_path,
                '-threads', '2',
                '-filter_complex',
                '[0:v]split=4[v1][v2][v3][v4];'
                '[v1]scale=640:360[v1out];'
                '[v2]scale=854:480[v2out];'
                '[v3]scale=1280:720[v3out];'
                '[v4]scale=1920:1080[v4out]',

                '-map', '[v1out]', '-map', '0:a',
                '-map', '[v2out]', '-map', '0:a',
                '-map', '[v3out]', '-map', '0:a',
                '-map', '[v4out]', '-map', '0:a',

                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-crf', '23',

                '-c:a', 'aac',
                '-b:a', '128k',

                '-g', '48',
                '-keyint_min', '48',
                '-sc_threshold', '0',

                '-f', 'hls',
                '-hls_time', '6',
                '-hls_playlist_type', 'vod',
                '-hls_segment_filename',
                os.path.join(video_folder, '%v_%03d.ts'),

                '-master_pl_name', 'master.m3u8',
                '-var_stream_map', 'v:0,a:0 v:1,a:1 v:2,a:2 v:3,a:3',

                os.path.join(video_folder, 'v%v.m3u8')
            ]

            subprocess.run(cmd, check=True)

            logging.info(f"✅ SUCCESS: {video_id}")

            # --- SUPABASE SYNC ---
            register_video_to_supabase(video_id, filename)

        except Exception as e:
            logging.error(f"❌ Error processing {filename}: {e}")

            if attempt < max_retries:
                logging.info(f"🔄 Retry {attempt+1}/{max_retries} in 10s")
                time.sleep(10)
                return self.process_video(input_path, attempt + 1)
            else:
                logging.critical(f"💀 Failed permanently: {filename}")
                os.rename(input_path, os.path.join(ERROR_DIR, filename))

# --- MAIN ---

if __name__ == "__main__":
    logging.info(f"🚀 Engine started. Watching: {WATCH_DIR}")

    event_handler = VideoHandler()
    observer = Observer()
    observer.schedule(event_handler, WATCH_DIR, recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()

    observer.join()
