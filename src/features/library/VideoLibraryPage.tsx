import React, { useState, useEffect } from 'react'
import { Play, X, PlayCircle, BookOpen, Clock, Info } from 'lucide-react'
import { supabase } from '../../services/supabaseClient'
import { VideoPlayer } from '../../components/VideoPlayer'

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

  const featuredVideo = videos[0]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!videos.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <BookOpen className="w-16 h-16 text-gray-300" />
        <h2 className="text-2xl font-bold text-dark">No videos found</h2>
        <p className="text-gray-500">Check back later for new content.</p>
      </div>
    )
  }

  return (
    <div className="space-y-16 pb-20">
      {/* Featured Hero Section */}
      {featuredVideo && (
        <section className="relative h-[60vh] md:h-[70vh] w-full rounded-[2.5rem] overflow-hidden group shadow-2xl">
          <img
            src={featuredVideo.thumbnail}
            alt={featuredVideo.title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/40 to-transparent" />

          <div className="absolute bottom-0 left-0 p-6 md:p-12 space-y-4 max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-primary text-white text-[10px] font-black rounded-full uppercase tracking-widest">Featured Video</span>
              {featuredVideo.duration && (
                <span className="text-white/60 text-xs font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {featuredVideo.duration}
                </span>
              )}
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-tight">
              {featuredVideo.title}
            </h1>
            <p className="text-white/70 text-sm md:text-lg font-medium leading-relaxed line-clamp-2">
              {featuredVideo.description}
            </p>
            <div className="flex items-center gap-4 pt-4">
              <button
                onClick={() => setSelectedVideo(featuredVideo)}
                className="bg-white text-dark px-8 py-3.5 rounded-2xl font-black flex items-center gap-2 hover:bg-primary hover:text-white transition-all active:scale-95 shadow-xl"
              >
                <Play className="w-5 h-5 fill-current" /> Watch Now
              </button>
              <button className="bg-white/10 backdrop-blur-md text-white border border-white/20 p-3.5 rounded-2xl hover:bg-white/20 transition-all">
                <Info className="w-6 h-6" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Grid Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-6">
        <h2 className="text-3xl font-black text-dark tracking-tight">Videos</h2>
        <p className="text-sm text-gray-500 font-bold">{videos.length} Total Videos</p>
      </div>

      {/* Video Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {videos.map(video => (
          <div
            key={video.id}
            onClick={() => setSelectedVideo(video)}
            className="group cursor-pointer space-y-4"
          >
            <div className="relative aspect-video rounded-3xl overflow-hidden shadow-lg border border-gray-100 bg-gray-100">
              <img
                src={video.thumbnail}
                alt={video.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-dark/20 group-hover:bg-dark/40 transition-all flex items-center justify-center">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center scale-75 group-hover:scale-100 transition-all duration-300 shadow-xl border border-white/30">
                  <Play className="text-white w-6 h-6 fill-current" />
                </div>
              </div>
              {video.duration && (
                <div className="absolute bottom-3 right-3 px-2 py-1 bg-dark/70 backdrop-blur-md text-white text-[10px] font-black rounded-lg">
                  {video.duration}
                </div>
              )}
            </div>
            <div className="px-1">
              <h3 className="font-bold text-dark group-hover:text-primary transition-colors line-clamp-2 leading-snug">{video.title}</h3>
              <div className="flex items-center gap-2 mt-1.5">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">{video.mentor}</p>
                <span className="w-1 h-1 bg-gray-300 rounded-full" />
                <p className="text-xs text-gray-400 font-bold">{video.category}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Video Player Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-dark/95 backdrop-blur-xl z-[100] flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
          <button
            onClick={() => setSelectedVideo(null)}
            className="absolute top-8 right-8 text-white/50 hover:text-white transition-colors z-50"
          >
            <X className="w-10 h-10" />
          </button>

          <div className="w-full max-w-5xl aspect-video bg-black rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/5 relative">
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
              <div className="absolute inset-0 flex items-center justify-center bg-dark">
                <div className="text-center space-y-4">
                  <PlayCircle className="w-20 h-20 text-primary mx-auto opacity-50" />
                  <p className="text-white/40 font-black tracking-widest uppercase text-xs">Video Source Not Found</p>
                  <p className="text-white font-bold">{selectedVideo.title}</p>
                </div>
              </div>
            )}
          </div>

          <div className="max-w-5xl w-full mt-12">
            <div className="space-y-4">
              <h2 className="text-4xl font-black text-white tracking-tight">{selectedVideo.title}</h2>
              <div className="flex items-center gap-4 text-white/40 font-bold text-sm">
                <span>{selectedVideo.mentor}</span>
                <span className="w-1 h-1 bg-white/20 rounded-full" />
                <span>{selectedVideo.category}</span>
                <span className="w-1 h-1 bg-white/20 rounded-full" />
                <span>{selectedVideo.duration}</span>
              </div>
              <p className="text-white/60 leading-relaxed text-lg">
                {selectedVideo.description}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
