import React, { useState, useEffect } from 'react'
import { Play, Search, Filter, Clock, BookOpen, Star, Info, X, ChevronRight, PlayCircle } from 'lucide-react'

interface Video {
  id: string
  title: string
  mentor: string
  category: string
  duration: string
  thumbnail: string
  hls_url: string
  description: string
}

export const VideoLibraryPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)

  // Mock data for MediaCMS integration
  const videos: Video[] = [
    {
      id: '1',
      title: 'The Philosophy of Deep Space',
      mentor: 'Mentor Jendh',
      category: 'Science',
      duration: '45m',
      thumbnail: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=800&q=80',
      hls_url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      description: 'Explore the existential implications of deep space travel and our place in the cosmic hierarchy.'
    },
    {
      id: '2',
      title: 'Quantum Mechanics for Beginners',
      mentor: 'Mentor Sharan',
      category: 'Physics',
      duration: '1h 20m',
      thumbnail: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=800&q=80',
      hls_url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      description: 'A deep dive into the world of subatomic particles and the uncertainty principle.'
    },
    {
      id: '3',
      title: 'Universal Design Systems',
      mentor: 'Mentor Alice',
      category: 'Design',
      duration: '55m',
      thumbnail: 'https://images.unsplash.com/photo-1558655146-d09347e92766?auto=format&fit=crop&w=800&q=80',
      hls_url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      description: 'Learn how to create interfaces that scale across the universe using minimalist principles.'
    },
    {
      id: '4',
      title: 'Ancient Wisdom in Modern Tech',
      mentor: 'Mentor Jendh',
      category: 'History',
      duration: '38m',
      thumbnail: 'https://images.unsplash.com/photo-1447069387593-a5de0862481e?auto=format&fit=crop&w=800&q=80',
      hls_url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      description: 'Bridging the gap between historical philosophical teachings and the future of technology.'
    }
  ]

  const featuredVideo = videos[0]

  return (
    <div className="space-y-12 pb-20">
      {/* Featured Hero Section */}
      <section className="relative h-[60vh] md:h-[70vh] w-full rounded-[2rem] overflow-hidden group shadow-2xl">
        <img 
          src={featuredVideo.thumbnail} 
          alt={featuredVideo.title} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/40 to-transparent" />
        
        <div className="absolute bottom-0 left-0 p-6 md:p-12 space-y-4 max-w-2xl">
          <div className="flex items-center gap-3">
             <span className="px-3 py-1 bg-primary text-white text-[10px] font-black rounded-full uppercase tracking-widest">Featured Workshop</span>
             <span className="text-white/60 text-xs font-bold flex items-center gap-1">
               <Clock className="w-3 h-3" /> {featuredVideo.duration}
             </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-tight">
            {featuredVideo.title}
          </h1>
          <p className="text-white/70 text-sm md:text-lg font-medium leading-relaxed">
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

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Search workshops or mentors..." 
            className="w-full bg-white border-2 border-transparent focus:border-primary/20 rounded-2xl py-3.5 pl-12 pr-4 font-bold text-dark outline-none shadow-sm transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {['All', 'Science', 'Physics', 'Design'].map(cat => (
            <button key={cat} className="px-5 py-2.5 bg-white rounded-xl text-xs font-bold text-gray-500 hover:text-primary border border-gray-100 shadow-sm transition-all">
              {cat}
            </button>
          ))}
          <button className="p-2.5 bg-white rounded-xl border border-gray-100 shadow-sm">
            <Filter className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Video Rows */}
      <VideoRow title="Recent Sessions" videos={videos} onSelect={setSelectedVideo} />
      <VideoRow title="Series Spotlight" videos={[...videos].reverse()} onSelect={setSelectedVideo} />

      {/* Video Player Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-dark/95 backdrop-blur-xl z-[100] flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
           <button 
             onClick={() => setSelectedVideo(null)}
             className="absolute top-8 right-8 text-white/50 hover:text-white transition-colors"
           >
             <X className="w-10 h-10" />
           </button>
           
           <div className="w-full max-w-5xl aspect-video bg-black rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/5 relative group">
              {/* This is where MediaCMS HLS player would live */}
              <div className="absolute inset-0 flex items-center justify-center bg-dark">
                <div className="text-center space-y-4">
                  <PlayCircle className="w-20 h-20 text-primary mx-auto opacity-50" />
                  <p className="text-white/40 font-black tracking-widest uppercase text-xs">Connecting to MediaCMS Stream...</p>
                  <p className="text-white font-bold">{selectedVideo.title}</p>
                </div>
              </div>
           </div>
           
           <div className="max-w-5xl w-full mt-12 grid md:grid-cols-3 gap-12">
              <div className="md:col-span-2 space-y-4">
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
              <div className="space-y-6">
                <div className="p-6 bg-white/5 rounded-[2rem] border border-white/10 space-y-4">
                   <h4 className="text-white font-bold text-sm">Session Materials</h4>
                   <button className="w-full py-3 bg-white/10 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 hover:bg-white/20 transition-all">
                     <BookOpen className="w-4 h-4" /> Download PDF Notes
                   </button>
                   <button className="w-full py-3 bg-white/10 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 hover:bg-white/20 transition-all">
                     <Star className="w-4 h-4" /> Save to Favorites
                   </button>
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  )
}

function VideoRow({ title, videos, onSelect }: { title: string; videos: Video[]; onSelect: (v: Video) => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-dark tracking-tight">{title}</h2>
        <button className="text-primary text-xs font-black uppercase tracking-widest flex items-center gap-1 hover:underline">
          See All <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-6 overflow-x-auto pb-6 -mx-4 px-4 scrollbar-hide">
        {videos.map(video => (
          <div 
            key={video.id} 
            onClick={() => onSelect(video)}
            className="flex-none w-64 md:w-80 group cursor-pointer space-y-4"
          >
            <div className="relative aspect-video rounded-3xl overflow-hidden shadow-lg border border-gray-100">
               <img 
                 src={video.thumbnail} 
                 alt={video.title} 
                 className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
               />
               <div className="absolute inset-0 bg-dark/20 group-hover:bg-dark/40 transition-all flex items-center justify-center">
                  <Play className="text-white w-12 h-12 opacity-0 group-hover:opacity-100 transition-all scale-50 group-hover:scale-100 duration-300" />
               </div>
               <div className="absolute bottom-3 right-3 px-2 py-1 bg-dark/70 backdrop-blur-md text-white text-[10px] font-black rounded-lg">
                 {video.duration}
               </div>
            </div>
            <div>
              <h3 className="font-bold text-dark group-hover:text-primary transition-colors line-clamp-1">{video.title}</h3>
              <p className="text-xs text-gray-400 font-medium">{video.mentor}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
