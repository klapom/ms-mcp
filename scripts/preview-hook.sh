#!/bin/bash

#################################################################
# Phase 8 E2E Tests — Preview Hook
#
# Runs all 4 Sprint E2E test scripts sequentially
# Exit code: 0 if all pass, non-zero if any fail
#
# Requirements:
# - Environment: AZURE_TENANT_ID, AZURE_CLIENT_ID must be set
# - OR: ~/.ms-mcp/token-cache.json must exist with cached token
# - Run pnpm auth login first to set up authentication
#################################################################

# Don't exit on error - we want to continue and report all failures
# set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Tracking
PASSED=0
FAILED=0
SKIPPED=0

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Phase 8 E2E Tests — Preview Hook${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Check authentication setup
if [ ! -f ~/.ms-mcp/token-cache.json ] && [ -z "$AZURE_TENANT_ID" ]; then
    echo -e "${YELLOW}⚠️  Authentication not configured${NC}"
    echo ""
    echo "To set up authentication, run:"
    echo "  pnpm auth login"
    echo ""
    echo "Or set environment variables:"
    echo "  export AZURE_TENANT_ID=..."
    echo "  export AZURE_CLIENT_ID=..."
    echo ""
    exit 1
fi

echo "Running all 4 Sprint 8 E2E test scripts..."
echo "Note: If tests fail due to permissions, add --no-verify to skip: git push --no-verify"
echo ""

# Track which tests passed/failed
declare -a TEST_RESULTS
declare -a TEST_NAMES

# Test 1: Sprint 8.1 — Search & Query Enhancements
echo -e "${YELLOW}[1/4]${NC} Running Sprint 8.1 E2E tests (Search & Query)..."
echo "─────────────────────────────────────────────────────────"

pnpm tsx "$SCRIPT_DIR/test-sprint-8-1-e2e.ts" 2>&1 || true
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Sprint 8.1 passed"
    TEST_RESULTS+=("✓")
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} Sprint 8.1 failed or skipped"
    TEST_RESULTS+=("✗")
    FAILED=$((FAILED + 1))
fi
TEST_NAMES+=("Sprint 8.1: Search & Query")
echo ""

# Test 2: Sprint 8.2 — Batch Operations
echo -e "${YELLOW}[2/4]${NC} Running Sprint 8.2 E2E tests (Batch Operations)..."
echo "─────────────────────────────────────────────────────────"

pnpm tsx "$SCRIPT_DIR/test-sprint-8-2-e2e.ts" 2>&1 || true
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Sprint 8.2 passed"
    TEST_RESULTS+=("✓")
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} Sprint 8.2 failed or skipped"
    TEST_RESULTS+=("✗")
    FAILED=$((FAILED + 1))
fi
TEST_NAMES+=("Sprint 8.2: Batch Operations")
echo ""

# Test 3: Sprint 8.3 — Advanced Calendar Features
echo -e "${YELLOW}[3/4]${NC} Running Sprint 8.3 E2E tests (Advanced Calendar)..."
echo "─────────────────────────────────────────────────────────"

pnpm tsx "$SCRIPT_DIR/test-sprint-8-3-e2e.ts" 2>&1 || true
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Sprint 8.3 passed"
    TEST_RESULTS+=("✓")
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} Sprint 8.3 failed or skipped"
    TEST_RESULTS+=("✗")
    FAILED=$((FAILED + 1))
fi
TEST_NAMES+=("Sprint 8.3: Advanced Calendar")
echo ""

# Test 4: Sprint 8.4 — Teams Advanced & Notifications
echo -e "${YELLOW}[4/4]${NC} Running Sprint 8.4 E2E tests (Teams Advanced)..."
echo "─────────────────────────────────────────────────────────"

pnpm tsx "$SCRIPT_DIR/test-sprint-8-4-e2e.ts" 2>&1 || true
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Sprint 8.4 passed"
    TEST_RESULTS+=("✓")
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} Sprint 8.4 failed or skipped"
    TEST_RESULTS+=("✗")
    FAILED=$((FAILED + 1))
fi
TEST_NAMES+=("Sprint 8.4: Teams Advanced")
echo ""

# Summary
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

for i in "${!TEST_RESULTS[@]}"; do
    result="${TEST_RESULTS[$i]}"
    name="${TEST_NAMES[$i]}"

    if [ "$result" == "✓" ]; then
        echo -e "${GREEN}${result}${NC} ${name}"
    else
        echo -e "${RED}${result}${NC} ${name}"
    fi
done

echo ""
echo -e "Total: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All Phase 8 E2E tests passed!${NC}"
    echo ""
    exit 0
else
    echo -e "${YELLOW}⚠️  Some tests failed or skipped${NC}"
    echo ""
    echo "To set up authentication first:"
    echo "  pnpm auth login"
    echo ""
    echo "Then re-run this hook or use --no-verify to skip:"
    echo "  git push --no-verify"
    echo ""
    exit 1
fi
