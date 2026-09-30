"""Simulation clock for BinSight demo.

The sim clock lets the demo fast-forward time so judges can see
waste accumulating after fixed trucks finish their morning routes.
"""
from datetime import datetime, timedelta
import threading

class SimClock:
    """Singleton simulation clock with speed control."""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        # Start at 08:30 today
        now = datetime.now()
        self._base_real_time = datetime.now()
        self._base_sim_time = now.replace(hour=8, minute=30, second=0, microsecond=0)
        self._speed = 1.0  # 1x real-time
        self._paused = False
    
    def now(self) -> datetime:
        """Get current simulation time."""
        if self._paused:
            return self._base_sim_time
        elapsed_real = (datetime.now() - self._base_real_time).total_seconds()
        elapsed_sim = elapsed_real * self._speed
        return self._base_sim_time + timedelta(seconds=elapsed_sim)
    
    def set_speed(self, speed: float):
        """Change simulation speed. Anchors current time first."""
        current = self.now()
        self._base_sim_time = current
        self._base_real_time = datetime.now()
        self._speed = speed
    
    def jump_to(self, hour: int, minute: int = 0):
        """Jump to a specific time today."""
        current = self.now()
        target = current.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target < current:
            target += timedelta(days=1)
        self._base_sim_time = target
        self._base_real_time = datetime.now()
    
    def set_time(self, dt: datetime):
        """Set simulation to an exact datetime."""
        self._base_sim_time = dt
        self._base_real_time = datetime.now()
    
    def pause(self):
        """Pause the simulation clock."""
        self._base_sim_time = self.now()
        self._paused = True
    
    def resume(self):
        """Resume the simulation clock."""
        self._base_real_time = datetime.now()
        self._paused = False
    
    def reset(self):
        """Reset to 08:30 at 1x speed."""
        now = datetime.now()
        self._base_real_time = now
        self._base_sim_time = now.replace(hour=8, minute=30, second=0, microsecond=0)
        self._speed = 1.0
        self._paused = False
    
    def to_dict(self):
        sim_now = self.now()
        return {
            'current_time': sim_now.isoformat(),
            'hour': sim_now.hour,
            'minute': sim_now.minute,
            'speed': self._speed,
            'paused': self._paused,
            'display': sim_now.strftime('%H:%M:%S'),
            'date': sim_now.strftime('%Y-%m-%d'),
        }


# Global instance
sim_clock = SimClock()
