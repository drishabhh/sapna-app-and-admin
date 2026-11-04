import { useEffect, useState } from 'react';
import { igEmbed, ytId } from './lib/content';
import { Icon } from './ui';

/**
 * The how-to video, right in the move's picture box.
 * Shows the YouTube thumbnail with a big play button; tap → the video plays inside the app.
 * (Not loaded until she taps, so it costs no data while she's just lifting.)
 */
export function YtPlayer({ url, title, style, autoPlay = false, onPlay }: { url: string; title: string; style?: React.CSSProperties; autoPlay?: boolean; onPlay?: () => void }) {
  const id = ytId(url);
  const ig = id ? null : igEmbed(url);
  const [playing, setPlayingRaw] = useState(autoPlay);
  const setPlaying = (v: boolean) => { setPlayingRaw(v); if (v && onPlay) onPlay(); };
  const [thumbOk, setThumbOk] = useState(true);
  useEffect(() => { setPlayingRaw(autoPlay); setThumbOk(true); if (autoPlay && onPlay) onPlay(); }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!id && !ig) return null;
  const box: React.CSSProperties = { ...style, position: 'relative', overflow: 'hidden', background: ig && playing ? '#fff' : '#000', borderRadius: 24, border: 'none', padding: 0 };
  if (ig && !playing) {
    return (
      <button type="button" className="yt-poster ig-poster" style={box} onClick={() => setPlaying(true)} aria-label={`Play how-to reel: ${title}`}>
        <span className="ig-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="34" height="34"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg></span>
        <span className="yt-cap"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg> Watch the reel — plays here</span>
      </button>
    );
  }
  if (playing) {
    const src = ig || `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=${id}`;
    return (
      <div style={box} className="yt-frame">
        <iframe
          src={src}
          title={`${title} — how to`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
      </div>
    );
  }
  return (
    <button type="button" className="yt-poster" style={box} onClick={() => setPlaying(true)} aria-label={`Play how-to video: ${title}`}>
      {thumbOk ? (
        <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" onError={() => setThumbOk(false)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
      ) : null}
      <span className="yt-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="34" height="34"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg></span>
      <span className="yt-cap"><Icon name="video" size={16} /> Watch how — plays here</span>
    </button>
  );
}
