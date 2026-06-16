"""
Telegram Phone Number Lookup Bot
Raqam orqali Telegram profilini topadi.
Python 3.7 uchun moslangan.
"""

import asyncio
import threading
import logging
from telethon.sync import TelegramClient
from telethon.tl.functions.contacts import ImportContactsRequest, DeleteContactsRequest
from telethon.tl.functions.account import ResolvePhoneRequest
from telethon.tl.types import InputPhoneContact
from telegram import Update
from telegram.ext import Updater, CommandHandler, MessageHandler, Filters, CallbackContext

logging.basicConfig(level=logging.INFO)

# === BU YERGA O'Z MA'LUMOTLARINGIZNI YOZING ===
API_ID = 0                    # my.telegram.org dan
API_HASH = ""                 # my.telegram.org dan
BOT_TOKEN = ""                # @BotFather dan
PHONE_NUMBER = ""             # Sizning raqamingiz: +998901234567
# ===============================================

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
        # 1-usul: account.resolvePhone (eng kuchli usul)
        try:
            result = await client(ResolvePhoneRequest(phone=phone))
            user = result.users[0] if result.users else None
            if user:
                return {
                    "id": user.id,
                    "first_name": getattr(user, "first_name", "") or "",
                    "last_name": getattr(user, "last_name", "") or "",
                    "username": getattr(user, "username", None),
                    "phone": getattr(user, "phone", None),
                }
        except Exception as e:
            logging.info("ResolvePhone ishlamadi: %s", e)

        # 2-usul: ImportContacts
        try:
            contact = InputPhoneContact(client_id=0, phone=phone, first_name="lookup", last_name="")
            result = await client(ImportContactsRequest([contact]))
            if result.users:
                user = result.users[0]
                await client(DeleteContactsRequest(id=[user]))
                return {
                    "id": user.id,
                    "first_name": user.first_name or "",
                    "last_name": user.last_name or "",
                    "username": user.username,
                    "phone": getattr(user, "phone", None),
                }
        except Exception as e:
            logging.info("ImportContacts ishlamadi: %s", e)

        # 3-usul: get_entity
        try:
            entity = await client.get_entity(phone)
            return {
                "id": entity.id,
                "first_name": getattr(entity, "first_name", "") or "",
                "last_name": getattr(entity, "last_name", "") or "",
                "username": getattr(entity, "username", None),
                "phone": getattr(entity, "phone", None),
            }
        except Exception as e:
            logging.info("get_entity ishlamadi: %s", e)

        return None

    future = asyncio.run_coroutine_threadsafe(_lookup(), loop)
    try:
        return future.result(timeout=15)
    except Exception as e:
        logging.error("Timeout: %s", e)
        return None


def cmd_start(update: Update, context: CallbackContext):
    update.message.reply_text(
        "Telefon Lookup Bot\n\n"
        "Menga telefon raqam yuboring — Telegram profilini topib beraman.\n\n"
        "Format: +998901234567"
    )


def handle_message(update: Update, context: CallbackContext):
    text = update.message.text.strip()
    digits = text.replace("+", "").replace(" ", "").replace("-", "")

    if not digits.isdigit() or len(digits) < 7:
        update.message.reply_text("Telefon raqam yuboring.\nMasalan: +998901234567")
        return

    msg = update.message.reply_text("Qidirilmoqda...")

    try:
        result = lookup_phone_sync(text)
    except Exception as e:
        msg.edit_text("Xato: {}".format(str(e)))
        return

    if result is None:
        msg.edit_text(
            "Topilmadi.\n\n"
            "Sabab: Bu raqam Telegram'da yoq yoki foydalanuvchi "
            "raqamini yashirgan (privacy sozlamasi)."
        )
        return

    name = "{} {}".format(result["first_name"], result["last_name"]).strip()
    username_line = "Username: @{}\n".format(result["username"]) if result["username"] else ""
    profile_link = "tg://user?id={}".format(result["id"])

    msg.edit_text(
        "Topildi!\n\n"
        "Ism: {}\n"
        "{}ID: {}\n"
        "Profil: {}".format(name, username_line, result["id"], profile_link)
    )


def main():
    t = threading.Thread(target=start_telethon_thread, daemon=True)
    t.start()

    import time
    time.sleep(5)

    updater = Updater(BOT_TOKEN)
    dp = updater.dispatcher
    dp.add_handler(CommandHandler("start", cmd_start))
    dp.add_handler(MessageHandler(Filters.text & ~Filters.command, handle_message))

    print("Bot ishlamoqda...")
    updater.start_polling()
    updater.idle()


if __name__ == "__main__":
    main()
