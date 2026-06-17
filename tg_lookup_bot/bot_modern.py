"""
Telegram Phone Number Lookup Bot
Python 3.10+ uchun (zamonaviy versiya)
"""

import asyncio
import logging
from telethon import TelegramClient
from telethon.tl.functions.contacts import ImportContactsRequest
from telethon.tl.types import InputPhoneContact, InputMediaContact
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes

logging.basicConfig(level=logging.INFO)

# === BU YERGA O'Z MA'LUMOTLARINGIZNI YOZING ===
API_ID = 0                    # my.telegram.org dan
API_HASH = ""                 # my.telegram.org dan
BOT_TOKEN = ""                # @BotFather dan
PHONE_NUMBER = ""             # O'zining raqami: +998901234567
# ===============================================

DEFAULT_COUNTRY_CODE = "998"  # O'zbekiston
SESSION_NAME = "lookup_session"

client: TelegramClient = None


def normalize_phone(phone: str) -> str:
    phone = phone.strip().replace(" ", "").replace("-", "")
    if phone.startswith("+"):
        return phone
    if phone.startswith("00"):
        return "+" + phone[2:]
    if len(phone) == 9:
        return "+" + DEFAULT_COUNTRY_CODE + phone
    return "+" + phone


async def lookup_phone(phone: str):
    phone = normalize_phone(phone)

    try:
        contact = InputPhoneContact(client_id=0, phone=phone, first_name="lookup", last_name="")
        result = await client(ImportContactsRequest([contact]))
        if result.users:
            user = result.users[0]

            try:
                await client.send_file(
                    "me",
                    InputMediaContact(
                        phone_number=getattr(user, "phone", None) or phone,
                        first_name=user.first_name or "lookup",
                        last_name=user.last_name or "",
                        vcard="",
                    ),
                )
            except Exception as e:
                logging.info("Saved Messages ga yuborilmadi: %s", e)

            return {
                "id": user.id,
                "first_name": user.first_name or "",
                "last_name": user.last_name or "",
                "username": user.username,
                "phone": getattr(user, "phone", None),
            }
    except Exception as e:
        logging.info("ImportContacts ishlamadi: %s", e)

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


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Telefon Lookup Bot\n\n"
        "Menga telefon raqam yuboring — Telegram profilini topib beraman.\n\n"
        "Format: +998901234567"
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text.strip()
    digits = text.replace("+", "").replace(" ", "").replace("-", "")

    if not digits.isdigit() or len(digits) < 7:
        await update.message.reply_text("Telefon raqam yuboring.\nMasalan: +998901234567")
        return

    msg = await update.message.reply_text("Qidirilmoqda...")

    result = await lookup_phone(text)

    if result is None:
        await msg.edit_text(
            "Topilmadi.\n\n"
            "Sabab: Bu raqam Telegram'da yoq yoki foydalanuvchi "
            "raqamini yashirgan (privacy sozlamasi)."
        )
        return

    name = "{} {}".format(result["first_name"], result["last_name"]).strip()
    username_line = "Username: @{}\n".format(result["username"]) if result["username"] else ""
    profile_link = "tg://user?id={}".format(result["id"])

    await msg.edit_text(
        "Topildi!\n\n"
        "Ism: {}\n"
        "{}ID: {}\n"
        "Profil: {}\n\n"
        "Ishlaydigan kontakt karta sizning Saved Messages bo'limiga yuborildi.".format(
            name, username_line, result["id"], profile_link
        )
    )


async def main():
    global client
    client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
    await client.start(phone=PHONE_NUMBER)
    print("Telethon ulandi!")

    app = ApplicationBuilder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    print("Bot ishlamoqda...")
    await app.initialize()
    await app.start()
    await app.updater.start_polling()

    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
