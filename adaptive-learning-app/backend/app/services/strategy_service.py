"""
app/services/strategy_service.py
Rule-based teaching strategy selection from learner behaviour.
"""

from dataclasses import dataclass

# Thresholds in milliseconds. These are starting values; tune them later.
SLOW_MS = 30_000   # 30 seconds
FAST_MS = 10_000   # 10 seconds

STEP_BY_STEP = "step_by_step"   # explain in small ordered steps
SIMPLIFIED = "simplified"       # shorter, easier explanation
STANDARD = "standard"           # normal explanation
CHALLENGE = "challenge"         # move to a harder question


@dataclass
class BehaviourSignals:
    is_correct: bool
    response_time_ms: int | None = None
    help_requested: bool = False
    attempts_count: int = 1
    skipped: bool = False


@dataclass
class StrategyChoice:
    strategy: str
    reason: str


def select_strategy(s: BehaviourSignals) -> StrategyChoice:
    slow = s.response_time_ms is not None and s.response_time_ms > SLOW_MS
    fast = s.response_time_ms is not None and s.response_time_ms < FAST_MS

    if s.skipped:
        return StrategyChoice(SIMPLIFIED, "Learner skipped the question.")

    if s.help_requested and slow:
        return StrategyChoice(SIMPLIFIED, "Learner was slow and asked for help.")

    if not s.is_correct:
        return StrategyChoice(STEP_BY_STEP, "Answer was wrong; explain step by step.")

    if s.help_requested or s.attempts_count > 1 or slow:
        return StrategyChoice(STANDARD, "Correct, but needed help, retries or time.")

    if fast:
        return StrategyChoice(CHALLENGE, "Correct, fast and first try; increase difficulty.")

    return StrategyChoice(STANDARD, "Correct with normal pace.")