# Issue 99: Status CORS / iframe fix

## Problem
The status page at /status was blocked from being embedded in iframes on other pages due to the global X-Frame-Options: SAMEORIGIN header set in nginx.conf.

## Solution
Overrode the X-Frame-Options header in the /status nginx location block to allow iframe embedding, while preserving other security headers.

## Changes
- Modified /etc/nginx/sites-available/ai.memention.net: added add_header directives to the /status location block to clear X-Frame-Options while keeping X-Content-Type-Options and Strict-Transport-Security.

## Status: DONE
