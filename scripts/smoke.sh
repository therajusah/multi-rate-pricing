set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
JAR_A="$(mktemp)"
JAR_B="$(mktemp)"
trap 'rm -f "$JAR_A" "$JAR_B"' EXIT

pass=0
fail=0

call() {
  local jar=$1 method=$2 path=$3 body=${4:-}
  if [ -n "$body" ]; then
    curl -sS -o /tmp/smoke.out -w '%{http_code}' -b "$jar" -c "$jar" \
      -X "$method" -H 'content-type: application/json' -d "$body" "$BASE$path"
  else
    curl -sS -o /tmp/smoke.out -w '%{http_code}' -b "$jar" -c "$jar" -X "$method" "$BASE$path"
  fi
  echo
  cat /tmp/smoke.out
}

check() {
  if [ "$2" = "$3" ]; then
    printf '  ok   %-52s %s\n' "$1" "$3"
    pass=$((pass + 1))
  else
    printf '  FAIL %-52s expected %s, got %s\n' "$1" "$2" "$3"
    fail=$((fail + 1))
  fi
}

status() { head -n1 <<<"$1"; }
body() { tail -n +2 <<<"$1"; }
field() { node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const v=process.argv[1].split('.').reduce((a,k)=>a?.[k],JSON.parse(s));console.log(v===undefined?'':v)})" "$1"; }

email="smoke-$(date +%s)-$RANDOM@example.com"
line_widget_a='{"description":"Widget A","quantity":2,"unitPrice":"100.00","discount":{"type":"percent","value":"10"},"taxPercent":"5"}'
line_widget_b='{"description":"Widget B","quantity":1,"unitPrice":"50.00","taxPercent":"5"}'
line_service='{"description":"Service fee","quantity":1,"unitPrice":"200.00","discount":{"type":"fixed","value":"20.00"}}'

echo "Smoke testing $BASE"

echo "auth"
r=$(call "$JAR_A" GET /api/documents)
check "documents require a session" 401 "$(status "$r")"

r=$(call "$JAR_A" POST /api/auth/signup "{\"email\":\"$email\",\"password\":\"short\"}")
check "password minimum enforced" 422 "$(status "$r")"

r=$(call "$JAR_A" POST /api/auth/signup "{\"email\":\"$email\",\"password\":\"smoke-password\"}")
check "signup" 201 "$(status "$r")"

r=$(call "$JAR_A" POST /api/auth/signup "{\"email\":\"$email\",\"password\":\"smoke-password\"}")
check "duplicate email rejected" 409 "$(status "$r")"

r=$(call "$JAR_A" POST /api/auth/login "{\"email\":\"$email\",\"password\":\"wrong-password\"}")
check "bad password rejected" 401 "$(status "$r")"

echo "validation"
for bad in \
  '{"description":"x","quantity":0,"unitPrice":"10.00"}' \
  '{"description":"x","quantity":-1,"unitPrice":"10.00"}' \
  '{"description":"x","quantity":1,"unitPrice":"-10.00"}' \
  '{"description":"x","quantity":1,"unitPrice":"10.00","taxPercent":"150"}' \
  '{"description":"x","quantity":1,"unitPrice":"10.00","discount":{"type":"fixed","value":"10.01"}}' \
  '{"description":"x","quantity":1,"unitPrice":"10.005"}'; do
  r=$(call "$JAR_A" POST /api/documents "{\"title\":\"t\",\"customer\":\"c\",\"issueDate\":\"2026-08-01\",\"lines\":[$bad]}")
  check "rejected: $(cut -c1-40 <<<"$bad")" 422 "$(status "$r")"
done

echo "calculations"
r=$(call "$JAR_A" POST /api/documents \
  "{\"title\":\"Sample\",\"customer\":\"Acme\",\"issueDate\":\"2026-08-01\",\"lines\":[$line_widget_a,$line_widget_b,$line_service]}")
check "create document" 201 "$(status "$r")"
doc=$(body "$r")
id=$(field document.id <<<"$doc")
check "subtotal 450.00" 45000 "$(field document.totals.subtotalCents <<<"$doc")"
check "total discount 40.00" 4000 "$(field document.totals.discountCents <<<"$doc")"
check "total tax 11.50" 1150 "$(field document.totals.taxCents <<<"$doc")"
check "grand total 421.50" 42150 "$(field document.totals.grandTotalCents <<<"$doc")"
check "Widget A taxed on 180.00" 900 "$(field document.lines.0.totals.taxCents <<<"$doc")"

echo "tenancy"
r=$(call "$JAR_B" POST /api/auth/signup "{\"email\":\"other-$email\",\"password\":\"smoke-password\"}")
check "second account" 201 "$(status "$r")"
r=$(call "$JAR_B" GET "/api/documents/$id")
check "other user cannot read the document" 404 "$(status "$r")"
r=$(call "$JAR_B" POST "/api/documents/$id/finalize")
check "other user cannot finalize it" 404 "$(status "$r")"

echo "lifecycle"
r=$(call "$JAR_A" POST "/api/documents/$id/lines" "$line_widget_b")
check "add line to draft" 201 "$(status "$r")"
line_id=$(field document.lines.3.id <<<"$(body "$r")")
r=$(call "$JAR_A" DELETE "/api/documents/$id/lines/$line_id")
check "remove line from draft" 200 "$(status "$r")"
check "totals back to 421.50" 42150 "$(field document.totals.grandTotalCents <<<"$(body "$r")")"

r=$(call "$JAR_A" POST "/api/documents/$id/finalize")
check "finalize" 200 "$(status "$r")"
check "status is finalized" finalized "$(field document.status <<<"$(body "$r")")"

r=$(call "$JAR_A" PATCH "/api/documents/$id" '{"title":"Renamed"}')
check "finalized: metadata edit rejected" 409 "$(status "$r")"
check "  with code" DOCUMENT_FINALIZED "$(field error.code <<<"$(body "$r")")"
r=$(call "$JAR_A" POST "/api/documents/$id/lines" "$line_widget_b")
check "finalized: adding a line rejected" 409 "$(status "$r")"
r=$(call "$JAR_A" DELETE "/api/documents/$id")
check "finalized: delete rejected" 409 "$(status "$r")"
r=$(call "$JAR_A" POST "/api/documents/$id/finalize")
check "finalized: re-finalize rejected" 409 "$(status "$r")"

r=$(call "$JAR_A" POST "/api/documents/$id/duplicate")
check "duplicate into a new draft" 201 "$(status "$r")"
copy=$(body "$r")
check "  copy is a draft" draft "$(field document.status <<<"$copy")"
check "  copy keeps the totals" 42150 "$(field document.totals.grandTotalCents <<<"$copy")"
copy_id=$(field document.id <<<"$copy")
r=$(call "$JAR_A" PATCH "/api/documents/$copy_id" '{"title":"Editable again"}')
check "  copy is editable" 200 "$(status "$r")"

echo "report"
r=$(call "$JAR_A" GET "/api/reports/summary?from=2026-08-01&to=2026-08-01")
check "summary in range" 200 "$(status "$r")"
summary=$(body "$r")
check "  two documents" 2 "$(field summary.documentCount <<<"$summary")"
check "  grand totals summed" 84300 "$(field summary.totals.grandTotalCents <<<"$summary")"
check "  tax summed" 2300 "$(field summary.totals.taxCents <<<"$summary")"
check "  discount summed" 8000 "$(field summary.totals.discountCents <<<"$summary")"

r=$(call "$JAR_A" GET "/api/reports/summary?from=2026-09-01&to=2026-09-30")
check "empty range is zeroed" 0 "$(field summary.totals.grandTotalCents <<<"$(body "$r")")"
r=$(call "$JAR_A" GET "/api/reports/summary?from=2026-09-30&to=2026-09-01")
check "reversed range rejected" 422 "$(status "$r")"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
