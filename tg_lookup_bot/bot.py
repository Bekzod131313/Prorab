"""
Telegram Phone Number Lookup Bot
Python 3.7 uchun moslanган
"""

import os
import asyncio
import threading
import logging
from telethon.sync import TelegramClient
from telethon.tl.functions.contacts import ImportContactsRequest, DeleteContactsRequest
from telethon.tl.types import InputPhoneContact
from telegram import Update
from telegram.ext import Updater, CommandHandler, MessageHandler, Filters

logging.basicConfig(level=logging.INFO)

# === SOZLAMALAR - BU YERGA O'Z MA'LUMOTLARINGIZNI YOZING ===
API_ID = 0                   # my.telegram.org dan olgan raqam
API_HASH = ""                # my.telegram.org dan olgan hash
BOT_TOKEN = ""               # @BotFather dan olgan token
PHONE_NUMBER = ""            # Sizning raqamingiz masalan: +998901234567
# ===========================================================

SESSION_NAME = "lookup_session"
client = None
loop = None


def start_telethon_thread():
    global client, loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    client = TelegramClient(SESSION_NAME, API_ID, API_HASH, loop=loop)
    client.start(phone=PHONE_NUMBER)
    print("Telethon ulandi!")
    loop.run_forever()


def lookup_phone_sync(phone):
    phone = phone.strip().replace(" ", "").replace("-", "")
    if not phone.startswith("+"):
        phone = "+" + phone

    async def _lookup():
        contact = InputPhoneContact(
            client_id=0,
            phone=phone,
            first_name="lookup",
            last_name=""
        )
        try:
            result = await client(ImportContactsRequest([contact]))
            users = result.users
            if not users:
                return None
            user = users[0]
            await client(DeleteContactsRequest(id=[user]))
            return {
                "id": user.id,
                "first_name": user.first_name or "",
                "last_name": user.last_name or "",
                "username": user.username,
                "phone": getattr(user, "phone", None),
            }
        except Exception as e:
            logging.error("Lookup xatosi: %s", e)
            return None

    future = asyncio.run_coroutine_threadsafe(_lookup(), loop)
    return future.result(timeout=15)


def cmd_start(update, context):
    update.message.reply_text(
        "Telefon Lookup Bot\n\n"
        "Menga telefon raqam yuboring.\n"
        "Format: +998901234567"
    )


def handle_message(update, context):
    text = update.message.text.strip()
    digits = text.replace("+", "").replace(" ", "").replace("-", "")

    if not digits.isdigit() or len(digits) < 7:
        update.message.reply_text("Iltimos togri telefon raqam yuboring.\nMasalan: +998901234567")
        return

    msg = update.message.reply_text("Qidirilmoqda...")

    try:
        result = lookup_phone_sync(text)
    except Exception as e:
        msg.edit_text("Xato yuz berdi: {}".format(str(e)))
        return

    if result is None:
        msg.edit_text(
            "Bu raqamga ulangan Telegram topilmadi.\n"
            "Sabab: foydalanuvchi Telegram ishlatmaydi yoki raqamini yashirgan."
        )
        return

    name = "{} {}".format(result["first_name"], result["last_name"]).strip()
    username_line = "@{}\n".format(result["username"]) if result["username"] else ""
    profile_link = "tg://user?id={}".format(result["id"])

    msg.edit_text(
        "Topildi!\n\n"
        "Ism: {}\n"
        "{}ID: {}\n"
        "Profil: {}".format(name, username_line, result["id"], profile_link)
    )


def main():
    # Telethon ni alohida threadda ishga tushiramiz
    t = threading.Thread(target=start_telethon_thread, daemon=True)
    t.start()

    # Telethon ulanishini kutamiz
    import time
    time.sleep(5)

    # Bot ishga tushadi
    updater = Updater(BOT_TOKEN)
    dp = updater.dispatcher
    dp.add_handler(CommandHandler("start", cmd_start))
    dp.add_handler(MessageHandler(Filters.text & ~Filters.command, handle_message))

    print("Bot ishlamoqda...")
    updater.start_polling()
    updater.idle()


if __name__ == "__main__":
    main()
