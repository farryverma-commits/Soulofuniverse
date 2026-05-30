import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Play, X, PlayCircle, BookOpen } from 'lucide-react'
import { supabase } from '../../services/supabaseClient'
import { VideoPlayer } from '../../components/VideoPlayer'
import { OrbitalLoader } from '../../components/OrbitalLoader'

interface Video {
  id: string
  title: string
  mentor: string
  category: string
  duration: string
  thumbnail: string
  master_url: string
  description: string
}

export const VideoLibraryPage: React.FC = () => {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const closeModal = useCallback(() => setSelectedVideo(null), [])

  useEffect(() => {
    if (!selectedVideo) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }

    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [selectedVideo, closeModal])

  useEffect(() => {
    async function fetchVideos() {
      try {
        const { data, error } = await supabase
          .from('videos')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw error

        if (data) {
          const mappedVideos: Video[] = data.map(v => ({
            id: v.id,
            title: v.title,
            mentor: v.metadata?.mentor || 'Soul Of Universe',
            category: v.metadata?.category || 'General',
            duration: v.metadata?.duration || '',
            thumbnail: v.thumb_url || '',
            master_url: v.master_url || '',
            description: v.metadata?.description || 'No description available.'
          }))
          setVideos(mappedVideos)
        }
      } catch (err) {
        console.error('Error fetching videos:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchVideos()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <OrbitalLoader variant="inline" label="Loading video library..." />
      </div>
    )
  }

  if (!videos.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-3">
        <BookOpen className="w-12 h-12 text-text-muted" />
        <h2 className="text-lg font-bold text-text">No videos found</h2>
        <p className="text-sm text-text-secondary">Check back later for new content.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Grid header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-lg font-bold text-text">Videos</h2>
        <span className="section-label">{videos.length} total</span>
      </div>

      {/* Video grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {videos.map((video, i) => (
          <button
            key={video.id}
            onClick={() => setSelectedVideo(video)}
            className="group cursor-pointer animate-fade-in text-left w-full focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 rounded-md"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="relative aspect-video rounded-md overflow-hidden bg-border border border-border">
              <img
                src={video.thumbnail}
                alt={video.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-nav/0 group-hover:bg-nav/30 transition-colors flex items-center justify-center">
                <div className="w-10 h-10 bg-white/90 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                  <Play size={16} className="text-text ml-0.5 fill-current" />
                </div>
              </div>
              {video.duration && (
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-nav/80 text-white text-[10px] font-semibold rounded">
                  {video.duration}
                </div>
              )}
            </div>
            <div className="mt-2.5 px-0.5">
              <h3 className="text-sm font-semibold text-text group-hover:text-primary transition-colors leading-snug line-clamp-2">{video.title}</h3>
              <div className="flex items-center gap-1.5 mt-1">
                <p className="text-xs text-text-muted font-medium">{video.mentor}</p>
                <span className="w-0.5 h-0.5 bg-text-muted rounded-full" />
                <p className="text-xs text-text-muted font-medium">{video.category}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Player modal */}
      {selectedVideo && (
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Video player: ${selectedVideo.title}`}
          className="fixed inset-0 bg-nav/95 z-[100] flex flex-col items-center justify-start md:justify-center p-4 overflow-y-auto animate-fade-in"
        >
          <button
            ref={closeButtonRef}
            onClick={closeModal}
            className="fixed top-4 right-4 md:top-6 md:right-6 text-white/40 hover:text-white transition-colors z-[110] bg-white/5 rounded-md p-2"
            aria-label="Close video player"
          >
            <X size={20} />
          </button>

          <div className="w-full max-w-5xl aspect-video bg-black rounded-md overflow-hidden shadow-2xl relative mt-12 md:mt-0 flex-shrink-0">
            {selectedVideo.master_url ? (
              <VideoPlayer
                options={{
                  autoplay: true,
                  controls: true,
                  responsive: true,
                  fill: true,
                  playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
                  controlBar: {
                    children: [
                      'playToggle',
                      'volumePanel',
                      'currentTimeDisplay',
                      'timeDivider',
                      'durationDisplay',
                      'progressControl',
                      'spacer',
                      'playbackRateMenuButton',
                      'subsCapsButton',
                      'audioTrackButton',
                      'fullscreenToggle',
                    ],
                  },
                  sources: [{
                    src: selectedVideo.master_url,
                    type: 'application/x-mpegURL'
                  }]
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-nav">
                <div className="text-center space-y-3">
                  <PlayCircle className="w-12 h-12 text-white/20 mx-auto" />
                  <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">Video source not found</p>
                  <p className="text-white/70 text-sm font-semibold">{selectedVideo.title}</p>
                </div>
              </div>
            )}
          </div>

          <div className="max-w-5xl w-full mt-6 mb-12">
            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">{selectedVideo.title}</h2>
            <div className="flex items-center gap-3 text-white/40 text-xs font-medium mt-2">
              <span>{selectedVideo.mentor}</span>
              <span className="w-0.5 h-0.5 bg-white/20 rounded-full" />
              <span>{selectedVideo.category}</span>
              <span className="w-0.5 h-0.5 bg-white/20 rounded-full" />
              <span>{selectedVideo.duration}</span>
            </div>
            <p className="text-white/50 text-sm leading-relaxed mt-3 max-w-2xl">
              {selectedVideo.description}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
