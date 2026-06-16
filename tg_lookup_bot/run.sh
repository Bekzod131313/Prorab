#!/bin/bash
# .env faylni yuklaymiz va botni ishga tushuramiz
export $(cat .env | xargs)
python bot.py
