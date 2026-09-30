"""Priority scoring for BinSight reports.

Transparent, rule-based scoring - every component is shown in the UI.
No black box. A plain Python function.
"""
import json
from datetime import datetime


# Category severity weights (higher = more urgent)
CATEGORY_SEVERITY = {
    'Medical/Hazardous': 10,
    'Construction Waste': 8,
    'Organic': 7,       # Odor, health risk
    'Mixed Waste': 5,
    'Glass': 4,
    'Metal': 4,
    'Plastic': 3,
    'Paper': 2,
    'Other': 4,
}

# Size to estimated waste (kg)
SIZE_WASTE_MAP = {
    'small': 3.0,
    'medium': 8.0,
    'large': 20.0,
}


def estimate_waste(size: str, category: str) -> float:
    """Estimate waste in kg from size and category."""
    base = SIZE_WASTE_MAP.get(size, 8.0)
    if category == 'Construction Waste':
        base *= 3.0  # Construction waste is heavy
    elif category in ('Metal', 'Glass'):
        base *= 1.5
    return round(base, 1)


def compute_priority(report, duplicate_count: int = 1, is_recurring_hotspot: bool = False,
                     hours_until_fixed_pass: float = None, sim_now: datetime = None) -> dict:
    """
    Compute priority score and breakdown for a report.
    
    Returns dict with:
      score: float 0-100
      priority: LOW/MEDIUM/HIGH/CRITICAL
      breakdown: dict of component scores and explanations
    """
    if sim_now is None:
        sim_now = datetime.utcnow()
    
    breakdown = {}
    total = 0.0
    
    # 1. Category severity (0-25 points)
    cat_score = CATEGORY_SEVERITY.get(report.category, 4)
    cat_points = (cat_score / 10.0) * 25
    breakdown['category_severity'] = {
        'score': round(cat_points, 1),
        'max': 25,
        'reason': f"{report.category} severity: {cat_score}/10"
    }
    total += cat_points
    
    # 2. Duplicate group size (0-15 points)
    dup_points = min(duplicate_count * 5, 15)
    breakdown['duplicate_reports'] = {
        'score': round(dup_points, 1),
        'max': 15,
        'reason': f"{duplicate_count} related report(s) in this area"
    }
    total += dup_points
    
    # 3. Recurrence (0-15 points)
    rec_points = 15 if is_recurring_hotspot else 0
    breakdown['recurrence'] = {
        'score': rec_points,
        'max': 15,
        'reason': "Recurring hotspot area" if is_recurring_hotspot else "No recurrence detected"
    }
    total += rec_points
    
    # 4. Age of report (0-15 points, older = higher priority)
    if report.timestamp:
        age_hours = (sim_now - report.timestamp).total_seconds() / 3600
    else:
        age_hours = 0
    age_points = min(age_hours * 1.5, 15)
    breakdown['report_age'] = {
        'score': round(age_points, 1),
        'max': 15,
        'reason': f"Report age: {age_hours:.1f} hours"
    }
    total += age_points
    
    # 5. Hours until next fixed pass (0-15 points)
    if hours_until_fixed_pass is not None:
        wait_points = min(hours_until_fixed_pass * 1.5, 15)
        breakdown['wait_time'] = {
            'score': round(wait_points, 1),
            'max': 15,
            'reason': f"{hours_until_fixed_pass:.1f} hours until next fixed truck pass"
        }
    else:
        wait_points = 10  # No fixed route nearby
        breakdown['wait_time'] = {
            'score': wait_points,
            'max': 15,
            'reason': "No fixed route passes near this location"
        }
    total += wait_points
    
    # 6. Size factor (0-15 points)
    size_map = {'small': 3, 'medium': 8, 'large': 15}
    size_points = size_map.get(report.size, 8)
    breakdown['waste_size'] = {
        'score': size_points,
        'max': 15,
        'reason': f"Waste size: {report.size}"
    }
    total += size_points
    
    # Normalize to 0-100
    total = min(total, 100)
    
    # Medical/Hazardous is ALWAYS critical
    if report.category == 'Medical/Hazardous':
        priority = 'CRITICAL'
        total = max(total, 90)
    elif total >= 70:
        priority = 'CRITICAL'
    elif total >= 50:
        priority = 'HIGH'
    elif total >= 30:
        priority = 'MEDIUM'
    else:
        priority = 'LOW'
    
    return {
        'score': round(total, 1),
        'priority': priority,
        'breakdown': breakdown,
    }
