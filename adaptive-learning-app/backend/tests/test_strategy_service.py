from app.services.strategy_service import (
    BehaviourSignals, select_strategy,
    STEP_BY_STEP, SIMPLIFIED, STANDARD, CHALLENGE,
)


def test_wrong_answer_gets_step_by_step():
    s = BehaviourSignals(is_correct=False, response_time_ms=15000)
    assert select_strategy(s).strategy == STEP_BY_STEP


def test_skipped_gets_simplified():
    s = BehaviourSignals(is_correct=False, skipped=True)
    assert select_strategy(s).strategy == SIMPLIFIED


def test_fast_correct_first_try_gets_challenge():
    s = BehaviourSignals(is_correct=True, response_time_ms=5000)
    assert select_strategy(s).strategy == CHALLENGE


def test_correct_with_help_gets_standard():
    s = BehaviourSignals(is_correct=True, response_time_ms=20000, help_requested=True)
    assert select_strategy(s).strategy == STANDARD