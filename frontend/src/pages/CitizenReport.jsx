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
      alert('Failed to submit report. Please try again.');
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

  // ── RESULT VIEW ──
  if (result) {
    const report = result.report;

    return (
      <div className="fade-in" style={{ maxWidth: 600 }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h2 className="page-title">Report Received</h2>
          <p className="page-subtitle">Report #{report?.id} — processing complete</p>
        </div>

        {/* Duplicate Check */}
        {result.outcome === 'DUPLICATE' && (
          <div className="card slide-up" style={{ marginBottom: 14, borderLeft: '3px solid #8b5cf6' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6', marginBottom: 4 }}>DUPLICATE DETECTED</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {result.duplicate_info?.message}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Existing report category: {result.duplicate_info?.existing_category} ·
              Distance: {result.duplicate_info?.distance_meters}m ·
              Time diff: {result.duplicate_info?.time_diff_hours}h
            </div>
          </div>
        )}

        {/* DECISION — the core outcome */}
        {result.outcome === 'HELD' && (
          <div className="outcome-card held slide-up">
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1.5px', color: 'var(--text-muted)', marginBottom: 8 }}>DECISION</div>
            <div className="outcome-icon">⏳</div>
            <div className="outcome-title" style={{ color: 'var(--scheduled)' }}>HOLD — Scheduled Truck Approaching</div>
            <div className="outcome-message">{result.hold_info?.message}</div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              Route: {result.hold_info?.route_name} · ETA: ~{result.hold_info?.eta_minutes} min
            </div>
          </div>
        )}

        {result.outcome === 'ESCALATED' && (
          <div className="outcome-card escalated slide-up">
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1.5px', color: 'var(--text-muted)', marginBottom: 8 }}>DECISION</div>
            <div className="outcome-icon">🚐</div>
            <div className="outcome-title" style={{ color: 'var(--escalated)' }}>ESCALATE — Gap Crew Dispatched</div>
            <div className="outcome-message">{result.escalate_info?.message}</div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              No scheduled collection expected soon. Added to on-demand response queue.
            </div>
          </div>
        )}

        {result.outcome === 'DUPLICATE' && (
          <div className="outcome-card duplicate slide-up">
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1.5px', color: 'var(--text-muted)', marginBottom: 8 }}>DECISION</div>
            <div className="outcome-icon">🔗</div>
            <div className="outcome-title" style={{ color: '#8b5cf6' }}>GROUPED — Linked to Existing Report</div>
            <div className="outcome-message">Your report has been linked to a nearby existing report. No separate dispatch needed.</div>
          </div>
        )}

        {/* Report Details */}
        <div className="card slide-up" style={{ marginTop: 16 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Report Details</div>
          <div className="detail-row"><span className="detail-label">Category</span><span className="detail-value">{report?.category}</span></div>
          <div className="detail-row"><span className="detail-label">Priority</span><span className={`badge badge-${report?.priority?.toLowerCase()}`}>{report?.priority} ({report?.priority_score})</span></div>
          <div className="detail-row"><span className="detail-label">Size</span><span className="detail-value">{report?.size} ({report?.estimated_waste} kg)</span></div>
          <div className="detail-row"><span className="detail-label">Status</span><span className={`badge badge-${report?.status?.toLowerCase()}`}>{report?.status}</span></div>
          <div className="detail-row"><span className="detail-label">Location</span><span className="detail-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{report?.latitude?.toFixed(4)}, {report?.longitude?.toFixed(4)}</span></div>
        </div>

        {/* Intelligence Pipeline Note */}
        <div className="demo-note" style={{ marginTop: 14 }}>
          <strong>How this decision was made:</strong> BinSight combined your location, reported category, time of day, 
          nearby duplicate reports, scheduled truck ETA, and waste severity to determine whether a scheduled truck 
          will handle it — or a gap crew needs to be dispatched.
        </div>

        <button className="btn btn-primary" onClick={handleNewReport} style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}>
          📸 Submit Another Report
        </button>
      </div>
    );
  }

  // ── FORM VIEW ──
  return (
    <div className="fade-in">
      <div className="page-header">
        <h2 className="page-title">Report Waste</h2>
        <p className="page-subtitle">Upload a photo and location · Select waste type · System decides response</p>
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
                  <div className="upload-text" style={{ marginTop: 6 }}>{image.name}</div>
                </>
              ) : (
                <>
                  <div className="upload-icon">📷</div>
                  <div className="upload-text">Click to upload a photo of the waste</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>JPG, PNG up to 10MB</div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
          </div>

          {/* Location */}
          <div className="form-group">
            <label className="form-label">Location</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleGetLocation} disabled={gettingLocation}>
                {gettingLocation ? <span className="loading-spinner"></span> : '📍'} Use My Location
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>or click the map →</span>
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
            <label className="form-label">Waste Category</label>
            <select className="form-select" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Select a category</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <button type="submit" className="btn btn-primary" disabled={submitting || !position} style={{ width: '100%', justifyContent: 'center' }}>
            {submitting ? <span className="loading-spinner"></span> : '📤'} Submit Report
          </button>
        </form>

        {/* Map */}
        <div>
          <label className="form-label">Pick Location on Map</label>
          <div className="map-container" style={{ height: 420 }}>
            <MapContainer
              center={position || [19.1000, 72.8700]}
              zoom={14}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <LocationPicker position={position} setPosition={setPosition} />
            </MapContainer>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            Click on the map to set the waste location
          </div>
        </div>
      </div>
    </div>
  );
}
