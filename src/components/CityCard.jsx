import { useNavigate } from 'react-router-dom'

export default function CityCard({ city, transform, onRotateToFront }) {
  const navigate = useNavigate()

  const handleClick = () => {
    if (transform.isFront) {
      navigate(`/${city.id}`)
    } else if (onRotateToFront) {
      onRotateToFront()
    }
  }

  const cardStyle = {
    transform: `translate(-50%, -50%) translate3d(${transform.x}px, ${transform.y}px, ${transform.z}px) scale(${transform.scale}) rotateY(${transform.rotateY}deg)`,
    opacity: transform.opacity,
    zIndex: transform.zIndex,
    filter: `blur(${transform.blur}px)`,
    '--card-gradient': city.gradient,
    '--card-accent': city.accent,
    '--card-glow': city.accentGlow,
    pointerEvents: 'auto'
  }

  return (
    <article
      className={`city-card ${transform.isFront ? 'is-front' : ''}`}
      style={cardStyle}
      onClick={handleClick}
    >
      <div className="card-gradient-layer" />
      <div className="card-bottom-shade" />
      <div className="card-shine" />

      <div className="card-body">
        <div className="card-top">
          <span className="card-index">{city.index}</span>
          <span className="card-count">{city.count} photos</span>
        </div>

        <div className="card-bottom">
          <h3 className="card-name">{city.name}<span className="card-suffix">集</span></h3>
          <p className="card-name-en">{city.nameEn}</p>
          <p className="card-desc">{city.subtitle}</p>

          <div className="card-action">
            <span className="card-action-text">{transform.isFront ? '进入浏览' : '点击聚焦'}</span>
            <svg className="card-arrow" width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 9H14M14 9L9.5 4.5M14 9L9.5 13.5"
                stroke="currentColor" strokeWidth="1.4"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </article>
  )
}
