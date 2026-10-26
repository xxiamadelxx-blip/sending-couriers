"""Native Android UI hierarchy contract for at-a-glance courier earnings.

Unlike a screenshot-only presence check, this verifies that the monetary figure
is completely above the bottom navigation without scrolling the Home screen.
"""
import re


def bounds(node):
    if node is None:
        return None
    values = [int(x) for x in re.findall(r'\d+', node.get('bounds', ''))]
    return values if len(values) == 4 and values[2] > values[0] and values[3] > values[1] else None


def assert_income_above_nav(root, money='3 240 ₽', clearance=12):
    norm = lambda s: re.sub(r'\s+', ' ', str(s or '').replace('\u00a0', ' ')).strip()
    navigation = next((n for n in root.iter('node') if
                       norm(n.get('content-desc') or n.get('text')) == 'Главная'
                       and bounds(n) is not None), None)
    assert navigation is not None, 'Home navigation button missing from real Android XML'
    nav = bounds(navigation)
    matches = [n for n in root.iter('node') if norm(n.get('text')) == norm(money) and bounds(n) is not None]
    assert matches, f'Income amount {money!r} missing or has no onscreen bounds'
    amount = bounds(matches[0])
    assert amount[3] + clearance <= nav[1], (
        f'Income overlaps bottom navigation: money={amount}, nav={nav}, clearance={clearance}px')
    return {'incomeBottomPx': amount[3], 'navTopPx': nav[1], 'clearancePx': nav[1] - amount[3]}
