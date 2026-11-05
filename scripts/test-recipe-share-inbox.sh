#!/bin/sh
set -eu
inbox_test_dir=$(mktemp -d "${TMPDIR:-/tmp}/foodedo-inbox-tests.XXXXXX")
trap 'rm -rf "$inbox_test_dir"' EXIT
swiftc -module-cache-path /tmp/foodedo-swift-module-cache \
  ios/App/RecipeShare/SharedRecipeInbox.swift \
  scripts/test-recipe-share-inbox.swift -o "$inbox_test_dir/checks"
"$inbox_test_dir/checks"
