import { useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { createReport } from '../services/api';


const CATEGORIES = [
  'Plastic', 'Paper', 'Glass', 'Metal', 'Organic',
  'Mixed Waste', 'Construction Waste', 'Medical/Hazardous', 'Other'
];

const pinIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:28px;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5));">📍</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function LocationPicker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return position ? <Marker position={position} icon={pinIcon} /> : null;
}

export default function CitizenReport() {
  const [position, setPosition] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [description, setDescription] = useState('');
  const [size, setSize] = useState('medium');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const handleGetLocation = useCallback(() => {
    setGettingLocation(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPosition([pos.coords.latitude, pos.coords.longitude]);
          setGettingLocation(false);
        },
        () => {
          // Fallback: Mumbai area
          setPosition([19.1136, 72.8697]);
          setGettingLocation(false);
        }
      );
    } else {
      setPosition([19.1136, 72.8697]);
      setGettingLocation(false);
    }
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!position) {
      alert('Please set a location');
      return;
    }
    
    setSubmitting(true);
    try {
      const formData = new FormData();
      if (image) formData.append('image', image);
      formData.append('latitude', position[0]);
      formData.append('longitude', position[1]);
      formData.append('description', description);
      formData.append('size', size);
      if (category) formData.append('category', category);

      const { data } = await createReport(formData);
      setResult(data);
    } catch (e) {
      alert('Failed to submit report');
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewReport = () => {
    setResult(null);
    setImage(null);
    setImagePreview(null);
    setDescription('');
    setSize('medium');
    setCategory('');
    setPosition(null);
  };

  if (result) {
    return (
      <div className="fade-in" style={{ maxWidth: 640 }}>
        <div className="page-header">
          <h2 className="page-title">✅ Report Submitted</h2>
          <p className="page-subtitle">Report #{result.report?.id} has been created</p>
        </div>

        {/* AI Classification */}
        {result.ai_classification && (
          <div className="classification-result slide-up">
            <span className="ai-icon">🤖</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>AI Classification: {result.ai_classification.category}</div>
              <div className="classification-confidence">
                Confidence: {Math.round(result.ai_classification.confidence * 100)}%
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm btn-primary">✓ Confirm</button>
              <button className="btn btn-sm btn-outline">Change</button>
            </div>
          </div>
        )}

        {/* Outcome */}
        {result.outcome === 'HELD' && (
          <div className="outcome-card held slide-up">
            <div className="outcome-icon">⏳</div>
            <div className="outcome-title" style={{ color: '#3b82f6' }}>Held for Collection</div>
            <div className="outcome-message">{result.hold_info?.message}</div>
          </div>
        )}

        {result.outcome === 'ESCALATED' && (
          <div className="outcome-card escalated slide-up">
            <div className="outcome-icon">🚐</div>
            <div className="outcome-title" style={{ color: '#f59e0b' }}>Escalated to Gap Crew</div>
            <div className="outcome-message">{result.escalate_info?.message}</div>
          </div>
        )}

        {result.outcome === 'DUPLICATE' && (
          <div className="outcome-card duplicate slide-up">
            <div className="outcome-icon">🔗</div>
            <div className="outcome-title">Possible Duplicate</div>
            <div className="outcome-message">{result.duplicate_info?.message}</div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              Existing report category: {result.duplicate_info?.existing_category}<br />
              Distance: {result.duplicate_info?.distance_meters}m • Time diff: {result.duplicate_info?.time_diff_hours}h
            </div>
          </div>
        )}

        {/* Report Details */}
        <div className="card slide-up" style={{ marginTop: 20 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>Report Details</div>
          <div className="detail-row"><span className="detail-label">Category</span><span className="detail-value">{result.report?.category}</span></div>
          <div className="detail-row"><span className="detail-label">Priority</span><span className={`badge badge-${result.report?.priority?.toLowerCase()}`}>{result.report?.priority} ({result.report?.priority_score})</span></div>
          <div className="detail-row"><span className="detail-label">Size</span><span className="detail-value">{result.report?.size} ({result.report?.estimated_waste} kg)</span></div>
          <div className="detail-row"><span className="detail-label">Status</span><span className={`badge badge-${result.report?.status?.toLowerCase()}`}>{result.report?.status}</span></div>
          <div className="detail-row"><span className="detail-label">Location</span><span className="detail-value">{result.report?.latitude?.toFixed(4)}, {result.report?.longitude?.toFixed(4)}</span></div>
        </div>

        <button className="btn btn-primary" onClick={handleNewReport} style={{ marginTop: 20 }}>
          📸 Submit Another Report
        </button>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2 className="page-title">📸 Report Waste</h2>
        <p className="page-subtitle">Upload a photo and location to report waste accumulation in your area</p>
      </div>

      <div className="two-col">
        <form className="report-form" onSubmit={handleSubmit}>
          {/* Image Upload */}
          <div className="form-group">
            <label className="form-label">Waste Photo</label>
            <div
              className={`upload-area ${imagePreview ? 'has-file' : ''}`}
              onClick={() => fileRef.current.click()}
            >
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="Preview" className="upload-preview" />
                  <div className="upload-text" style={{ marginTop: 8 }}>{image.name}</div>
                </>
              ) : (
                <>
                  <div className="upload-icon">📷</div>
                  <div className="upload-text">Click to upload a photo of the waste</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>JPG, PNG up to 10MB</div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
          </div>

          {/* Location */}
          <div className="form-group">
            <label className="form-label">Location</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleGetLocation} disabled={gettingLocation}>
                {gettingLocation ? <span className="loading-spinner"></span> : '📍'} Use My Location
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>or click on the map →</span>
            </div>
            {position && (
              <div className="location-display">
                📍 <span className="location-coords">{position[0].toFixed(6)}, {position[1].toFixed(6)}</span>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              placeholder="Describe the waste (e.g., pile of plastic bags near the bus stop)..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Size */}
          <div className="form-group">
            <label className="form-label">Estimated Size</label>
            <div className="size-selector">
              {['small', 'medium', 'large'].map(s => (
                <button
                  key={s}
                  type="button"
                  className={`size-option ${size === s ? 'active' : ''}`}
                  onClick={() => setSize(s)}
                >
                  {s === 'small' ? '🗑️ Small' : s === 'medium' ? '📦 Medium' : '🏗️ Large'}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="form-group">
            <label className="form-label">Category (optional — AI will classify)</label>
            <select className="form-select" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Let AI classify</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <button type="submit" className="btn btn-primary" disabled={submitting || !position}>
            {submitting ? <span className="loading-spinner"></span> : '📤'} Submit Report
          </button>
        </form>

        {/* Map for location picking */}
        <div>
          <label className="form-label">Pick Location on Map</label>
          <div className="map-container" style={{ height: 400 }}>
            <MapContainer
              center={position || [19.1000, 72.8700]}
              zoom={14}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <LocationPicker position={position} setPosition={setPosition} />
            </MapContainer>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Click on the map to set the waste location
          </div>
        </div>
      </div>
    </div>
  );
}
