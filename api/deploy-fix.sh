#!/bin/bash
cd /3cloud/api
kill $(ps aux | grep 'npm install' | grep -v grep | awk '{print $2}') 2>/dev/null
kill $(ps aux | grep 'tsc' | grep -v grep | awk '{print $2}') 2>/dev/null
sleep 2
npm install --legacy-peer-deps 2>&1 | tail -10
