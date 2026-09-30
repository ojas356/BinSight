"""Duplicate detection for BinSight.

A report is a possible duplicate when an open report exists within
DISTANCE_THRESHOLD meters and TIME_THRESHOLD hours with the same
or similar category. Mixed Waste matches everything.
"""
import math
from datetime import timedelta

# Configurable constants
DISTANCE_THRESHOLD = 40  # meters
TIME_THRESHOLD = 6  # hours


def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in meters using haversine formula."""
    R = 6371000  # Earth's radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    
    a = math.sin(dphi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def categories_match(cat1, cat2):
    """Check if categories are similar enough for duplicate detection."""
    if cat1 == cat2:
        return True
    if 'Mixed Waste' in (cat1, cat2):
        return True  # Mixed matches everything
    return False


def find_duplicate(new_report, existing_reports, sim_now=None):
    """
    Check if a new report is a duplicate of an existing open report.
    
    Args:
        new_report: dict with latitude, longitude, category, timestamp
        existing_reports: list of Report model instances
        sim_now: current simulation time
    
    Returns:
        (duplicate_report, distance, time_diff_hours) or (None, None, None)
    """
    from services.sim_clock import sim_clock
    
    if sim_now is None:
        sim_now = sim_clock.now()
    
    report_time = new_report.get('timestamp', sim_now)
    if isinstance(report_time, str):
        from datetime import datetime
        report_time = datetime.fromisoformat(report_time)
    
    best_match = None
    best_distance = float('inf')
    
    for existing in existing_reports:
        # Only check open (non-collected, non-historical) reports
        if existing.status == 'COLLECTED' or existing.is_historical:
            continue
        
        # Check time threshold
        time_diff = abs((report_time - existing.timestamp).total_seconds()) / 3600
        if time_diff > TIME_THRESHOLD:
            continue
        
        # Check category match
        if not categories_match(new_report.get('category', 'Mixed Waste'), existing.category):
            continue
        
        # Check distance
        distance = haversine_distance(
            new_report['latitude'], new_report['longitude'],
            existing.latitude, existing.longitude
        )
        
        if distance <= DISTANCE_THRESHOLD and distance < best_distance:
            best_match = existing
            best_distance = distance
            best_time_diff = time_diff
    
    if best_match:
        return best_match, round(best_distance, 1), round(best_time_diff, 2)
    
    return None, None, None
