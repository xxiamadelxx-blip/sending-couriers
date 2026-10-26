#!/usr/bin/env python3
"""Run Android UI acceptance gates independently, preserving strict failure statuses."""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def native_runner(name, commands):
    log = []
    for command in commands:
        log.append('$ ' + ' '.join(map(str, command)))
        try:
            result = subprocess.run(command, text=True, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, check=False)
            log.append(result.stdout)
            if result.returncode:
                return result.returncode, '\n'.join(log)
        except OSError as error:
            log.append(str(error))
            return 127, '\n'.join(log)
    return 0, '\n'.join(log)


def gate_commands(apk, prior, transfer):
    return {
        'ui_matrix': [['python3', 'qa/ui_audit_matrix.py', '--apk', apk,
                       '--phase', 'after', '--focus', 'full']],
        'action_layout': [['python3', 'qa/a11y_layout_matrix.py']],
        'native_edit_labels': [['python3', 'qa/a11y_xml_smoke.py']],
        'xlsx_import': [
            ['adb', 'shell', 'wm', 'size', '1080x2400'],
            ['adb', 'shell', 'wm', 'density', '480'],
            ['adb', 'shell', 'settings', 'put', 'system', 'font_scale', '1.0'],
            ['adb', 'shell', 'am', 'force-stop', 'ru.courier.finance'],
            ['adb', 'shell', 'am', 'start', '-n', 'ru.courier.finance/.MainActivity'],
            ['python3', 'qa/xlsx_import_smoke.py']],
        'large_font_form': [['python3', 'qa/form_large_text_smoke.py']],
        'transfer_upgrade': [['python3', 'qa/transfer_upgrade_smoke.py',
                              '--old', prior, '--new', transfer]],
    }


def execute_pipeline(output_dir, focus, apk, prior, transfer, runner=native_runner):
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / 'ui-independent-gates.json'
    gates = {}
    commands = gate_commands(apk, prior, transfer)
    names = tuple(commands)

    def save():
        failure = any(g['status'] in ('FAIL', 'BLOCKED') for g in gates.values())
        output.write_text(json.dumps({
            'result': 'FAIL' if failure else 'PASS',
            'test': 'independent native Android35 Gauntlet gates',
            'ciSha': os.environ.get('GITHUB_SHA', 'LOCAL'),
            'focus': focus,
            'productionSignerUsed': False,
            'ownerSignedUpgradeTested': False,
            'talkBackSpeechTested': False,
            'gates': gates,
        }, ensure_ascii=False, indent=2), encoding='utf-8')

    def run(name, *, blocked=False, skip=False):
        if skip:
            gates[name] = {'status': 'NOT RUN', 'reason': 'focus is not full'}
        elif blocked:
            gates[name] = {'status': 'BLOCKED', 'reason': 'UI matrix fixture/precondition failed'}
        else:
            try:
                exit_code, stdout = runner(name, commands[name])
            except Exception as error:
                exit_code, stdout = 127, f'Uncaught gate runner exception: {error}'
            log_path = output_dir / f'{name}.log'
            log_path.write_text(stdout, encoding='utf-8')
            gates[name] = {
                'status': 'PASS' if exit_code == 0 else 'FAIL',
                'exitCode': exit_code,
                'log': str(log_path),
            }
            print(f'{name}: {gates[name]["status"]} (exit {exit_code})', flush=True)
            if exit_code:
                print('\n'.join(stdout.splitlines()[-22:]), flush=True)
        save()

    if focus != 'full':
        commands['ui_matrix'][-1][-1] = focus
    run('ui_matrix')
    baseline_ok = gates['ui_matrix']['status'] == 'PASS'
    for name in names[1:-1]:
        run(name, skip=focus != 'full', blocked=not baseline_ok)
    # Transfer package is independent: always test update with synthetic state.
    run('transfer_upgrade')
    save()
    return 0 if json.loads(output.read_text())['result'] == 'PASS' else 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--focus', choices=('full', 'delta', 'content'), default='full')
    parser.add_argument('--apk', required=True)
    parser.add_argument('--old', required=True)
    parser.add_argument('--new', required=True)
    parser.add_argument('--out', type=Path, default=Path('qa-results/ui-independent-gates'))
    args = parser.parse_args()
    return execute_pipeline(args.out, args.focus, args.apk, args.old, args.new)


if __name__ == '__main__':
    sys.exit(main())
