"""Strict assertions for native Android35 empty-state accessibility snapshots.

This is structural UI evidence, not an assertion about TalkBack speech or
private storage contents. The integration smoke tests force-stop and navigate
history to corroborate that cancelling the form did not create any slot.
"""
import re


def _bounds(node):
    return [int(n) for n in re.findall(r'-?\d+', node.get('bounds', ''))]


def _name(node):
    return (node.get('content-desc') or node.get('text') or '').strip()


def _has(root, label):
    return any(_name(node) == label for node in root.iter('node'))


def assert_empty_home(root):
    assert _has(root, 'Смена ещё не записана'), 'Missing empty home heading'
    ctas = [node for node in root.iter('node')
            if _name(node) == 'Добавить первый слот' and node.get('clickable') == 'true']
    valid = any(len(b := _bounds(node)) == 4 and b[2] - b[0] >= 144
                and b[3] - b[1] >= 144 for node in ctas)
    assert valid, 'First-slot CTA must be a visible clickable >=48dp target'


def assert_empty_history(root):
    assert _has(root, 'Пока нет записей'), 'Missing empty history heading'
    unexpected = [node for node in root.iter('node')
                  if _name(node).startswith('Редактировать Слот')]
    assert not unexpected, 'Empty history contains unexpected slot edit actions'


def assert_empty_backup(state):
    """Independently check the persisted JSON backup after cancelling first slot.

    Missing/malformed fields are not converted to zero; this gate is strictly
    about durable slot records and does not assert weather/forecast freshness.
    """
    assert isinstance(state, dict), 'JSON backup must be an object with entries'
    entries = state.get('entries')
    assert isinstance(entries, list), 'JSON backup entries must be an array'
    assert not entries, f'Empty-state cancellation persisted {len(entries)} unexpected slots'
    return len(entries)
