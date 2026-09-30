"""Database models for BinSight."""
from database import db
from datetime import datetime
import json


class Report(db.Model):
    """Citizen waste report."""
    __tablename__ = 'reports'
    
    id = db.Column(db.Integer, primary_key=True)
    image = db.Column(db.String(500), nullable=True)  # Path to uploaded image
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    category = db.Column(db.String(50), nullable=False, default='Mixed Waste')
    confidence = db.Column(db.Float, default=0.0)  # AI classification confidence
    description = db.Column(db.Text, nullable=True)
    size = db.Column(db.String(20), default='medium')  # small, medium, large
    estimated_waste = db.Column(db.Float, default=5.0)  # kg
    priority = db.Column(db.String(20), default='MEDIUM')  # LOW, MEDIUM, HIGH, CRITICAL
    priority_score = db.Column(db.Float, default=0.0)
    priority_breakdown = db.Column(db.Text, nullable=True)  # JSON string
    status = db.Column(db.String(20), default='QUEUED')  # HELD, ESCALATED, QUEUED, COLLECTED
    held_by_route_id = db.Column(db.Integer, db.ForeignKey('fixed_routes.id'), nullable=True)
    eta_minutes = db.Column(db.Integer, nullable=True)
    duplicate_group_id = db.Column(db.Integer, nullable=True)
    hotspot_id = db.Column(db.Integer, db.ForeignKey('hotspots.id'), nullable=True)
    collected_at = db.Column(db.DateTime, nullable=True)
    collected_by = db.Column(db.String(100), nullable=True)  # "Fixed Route R1" or "Gap Vehicle G1"
    is_historical = db.Column(db.Boolean, default=False)  # Historical seed data
    
    def to_dict(self):
        return {
            'id': self.id,
            'image': self.image,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'category': self.category,
            'confidence': self.confidence,
            'description': self.description,
            'size': self.size,
            'estimated_waste': self.estimated_waste,
            'priority': self.priority,
            'priority_score': self.priority_score,
            'priority_breakdown': json.loads(self.priority_breakdown) if self.priority_breakdown else None,
            'status': self.status,
            'held_by_route_id': self.held_by_route_id,
            'eta_minutes': self.eta_minutes,
            'duplicate_group_id': self.duplicate_group_id,
            'hotspot_id': self.hotspot_id,
            'collected_at': self.collected_at.isoformat() if self.collected_at else None,
            'collected_by': self.collected_by,
            'is_historical': self.is_historical,
        }


class Truck(db.Model):
    """Truck / vehicle model - both fixed and gap."""
    __tablename__ = 'trucks'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    type = db.Column(db.String(10), nullable=False)  # FIXED or GAP
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    capacity_kg = db.Column(db.Float, default=1000.0)
    current_load_kg = db.Column(db.Float, default=0.0)
    status = db.Column(db.String(20), default='IDLE')  # IDLE, EN_ROUTE, COLLECTING, AT_DEPOT
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'capacity_kg': self.capacity_kg,
            'current_load_kg': self.current_load_kg,
            'available_capacity': self.capacity_kg - self.current_load_kg,
            'status': self.status,
        }


class FixedRoute(db.Model):
    """Fixed municipal collection routes - READ ONLY, never modified by any code path."""
    __tablename__ = 'fixed_routes'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    waypoints = db.Column(db.Text, nullable=False)  # JSON: [[lat, lon], ...]
    geometry = db.Column(db.Text, nullable=True)  # Cached route geometry from OSRM
    window_start = db.Column(db.String(5), nullable=False)  # "06:00"
    window_end = db.Column(db.String(5), nullable=False)  # "12:00"
    truck_id = db.Column(db.Integer, db.ForeignKey('trucks.id'), nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'waypoints': json.loads(self.waypoints) if self.waypoints else [],
            'geometry': json.loads(self.geometry) if self.geometry else None,
            'window_start': self.window_start,
            'window_end': self.window_end,
            'truck_id': self.truck_id,
        }


class Hotspot(db.Model):
    """DBSCAN-detected waste hotspot."""
    __tablename__ = 'hotspots'
    
    id = db.Column(db.Integer, primary_key=True)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    report_count = db.Column(db.Integer, default=0)
    estimated_waste = db.Column(db.Float, default=0.0)
    priority = db.Column(db.String(20), default='MEDIUM')
    recurring = db.Column(db.Boolean, default=False)
    recurrence_count = db.Column(db.Integer, default=0)  # Historical incidents
    recommendation = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default='ACTIVE')  # ACTIVE, RESOLVED
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'report_count': self.report_count,
            'estimated_waste': self.estimated_waste,
            'priority': self.priority,
            'recurring': self.recurring,
            'recurrence_count': self.recurrence_count,
            'recommendation': self.recommendation,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class GapRoute(db.Model):
    """Dynamic route for gap crew vehicles."""
    __tablename__ = 'gap_routes'
    
    id = db.Column(db.Integer, primary_key=True)
    truck_id = db.Column(db.Integer, db.ForeignKey('trucks.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    stops = db.Column(db.Text, nullable=False)  # JSON: [{report_id, lat, lon, order, status}]
    geometry = db.Column(db.Text, nullable=True)  # Cached route geometry
    total_distance = db.Column(db.Float, default=0.0)  # km
    estimated_waste = db.Column(db.Float, default=0.0)  # kg
    traffic_level = db.Column(db.String(20), default='LOW')
    traffic_multiplier = db.Column(db.Float, default=1.0)
    status = db.Column(db.String(20), default='PLANNED')  # PLANNED, IN_PROGRESS, COMPLETED
    
    def to_dict(self):
        return {
            'id': self.id,
            'truck_id': self.truck_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'stops': json.loads(self.stops) if self.stops else [],
            'geometry': json.loads(self.geometry) if self.geometry else None,
            'total_distance': self.total_distance,
            'estimated_waste': self.estimated_waste,
            'traffic_level': self.traffic_level,
            'traffic_multiplier': self.traffic_multiplier,
            'status': self.status,
        }
