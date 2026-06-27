#!/bin/zsh
# Gate harness for multitenant build loop. Usage: gates.sh <gate...>
# Gates: A=build/type B=apismoke C=isolation D=payments E=visual F=handoff
# Exit 0 = all requested gates GREEN. Non-zero = first RED gate.
set -o pipefail
cd "$(dirname "$0")/.." || exit 99
FAIL=0
report() { echo "GATE_$1: $2"; }

run_gate_A() {
  echo "=== GATE A: build/type ==="
  npx tsc --noEmit 2>&1 | tail -30
  if [ ${pipestatus[1]} -ne 0 ]; then report A "RED (tsc errors)"; return 1; fi
  report A "GREEN"; return 0
}

run_gate_C() {
  echo "=== GATE C: tenant isolation ==="
  if [ -f scripts/test-isolation.ts ]; then
    npx tsx scripts/test-isolation.ts 2>&1 | tail -40
    if [ ${pipestatus[1]} -ne 0 ]; then report C "RED (cross-tenant leak or test fail)"; return 1; fi
    report C "GREEN"; return 0
  else
    report C "SKIP (no test-isolation.ts yet)"; return 0
  fi
}

run_gate_B() {
  echo "=== GATE B: api smoke ==="
  if [ -f scripts/test-api.ts ]; then
    npx tsx scripts/test-api.ts 2>&1 | tail -40
    if [ ${pipestatus[1]} -ne 0 ]; then report B "RED (api smoke fail)"; return 1; fi
    report B "GREEN"; return 0
  else
    report B "SKIP (no test-api.ts yet)"; return 0
  fi
}

run_gate_D() {
  echo "=== GATE D: payments ==="
  if [ -f scripts/test-payments.ts ]; then
    npx tsx scripts/test-payments.ts 2>&1 | tail -40
    if [ ${pipestatus[1]} -ne 0 ]; then report D "RED (payments fail)"; return 1; fi
    report D "GREEN"; return 0
  else
    report D "SKIP (no test-payments.ts yet)"; return 0
  fi
}

run_gate_E() {
  echo "=== GATE E: visual (build proxy) ==="
  npm run build 2>&1 | tail -20
  if [ ${pipestatus[1]} -ne 0 ]; then report E "RED (next build fail)"; return 1; fi
  report E "GREEN (build ok; visual scoring runs in orchestrator)"; return 0
}

run_gate_F() {
  echo "=== GATE F: handoff ==="
  [ -f INTEGRATION_PLAYBOOK.md ] || { report F "RED (no playbook)"; return 1; }
  [ -f src/app/api/v1/openapi.json/route.ts -o -f public/openapi.json ] || { report F "RED (no openapi)"; return 1; }
  report F "GREEN"; return 0
}

for g in "$@"; do
  case "$g" in
    A) run_gate_A || FAIL=1 ;;
    B) run_gate_B || FAIL=1 ;;
    C) run_gate_C || FAIL=1 ;;
    D) run_gate_D || FAIL=1 ;;
    E) run_gate_E || FAIL=1 ;;
    F) run_gate_F || FAIL=1 ;;
    *) echo "unknown gate $g" ;;
  esac
done
[ $FAIL -eq 0 ] && echo "ALL_GATES_GREEN" || echo "GATES_RED"
exit $FAIL
