"""
Telegram Phone Number Lookup Bot
Telefon raqam orqali Telegram profilini topadi.

Kerakli kutubxonalar:
    pip install telethon python-telegram-bot

Ishlatish:
    1. https://my.telegram.org dan API_ID va API_HASH oling
    2. @BotFather dan BOT_TOKEN oling
    3. .env faylga yozing yoki quyidagi o'zgaruvchilarni to'ldiring
    4. python bot.py
"""

import os
import asyncio
import logging
from telethon import TelegramClient, events
from telethon.tl.functions.contacts import ImportContactsRequest, DeleteContactsRequest
from telethon.tl.types import InputPhoneContact
from telegram import Update, Bot
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes

logging.basicConfig(level=logging.INFO)

# === SOZLAMALAR ===
API_ID = int(os.getenv("API_ID", "0"))          # my.telegram.org dan
API_HASH = os.getenv("API_HASH", "")             # my.telegram.org dan
BOT_TOKEN = os.getenv("BOT_TOKEN", "")           # @BotFather dan
PHONE_NUMBER = os.getenv("PHONE_NUMBER", "")     # Sizning telefon raqamingiz (+998...)
SESSION_NAME = "lookup_session"

# Faqat shu admin ID lar ishlatishi mumkin (bo'sh qoldiring = hamma)
ALLOWED_USERS = []  # masalan: [123456789, 987654321]

# Global Telethon client
client: TelegramClient = None


async def start_telethon():
    global client
    client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
    await client.start(phone=PHONE_NUMBER)
    print("✅ Telethon ulandi")


async def lookup_phone(phone: str) -> dict | None:
    """Telefon raqam bo'yicha Telegram foydalanuvchini topadi."""
    phone = phone.strip().replace(" ", "").replace("-", "")
    if not phone.startswith("+"):
        phone = "+" + phone

    # Vaqtinchalik kontakt sifatida qo'shamiz
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

        # Kontaktni o'chirib tashlaymiz
        await client(DeleteContactsRequest(id=[user]))

        return {
            "id": user.id,
            "first_name": user.first_name or "",
            "last_name": user.last_name or "",
            "username": user.username,
            "phone": user.phone,
        }
    except Exception as e:
        logging.error(f"Lookup xatosi: {e}")
        return None


def is_allowed(user_id: int) -> bool:
    if not ALLOWED_USERS:
        return True
    return user_id in ALLOWED_USERS


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id):
        await update.message.reply_text("❌ Ruxsat yo'q.")
        return

    await update.message.reply_text(
        "📞 *Telefon Lookup Bot*\n\n"
        "Menga telefon raqam yuboring, Telegram profilini topib beraman.\n\n"
        "Format: `+998901234567`\n"
        "Yoki: `998901234567`",
        parse_mode="Markdown"
    )


async def handle_phone(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id):
        await update.message.reply_text("❌ Ruxsat yo'q.")
        return

    text = update.message.text.strip()

    # Raqam ekanligini tekshiramiz
    digits = text.replace("+", "").replace(" ", "").replace("-", "")
    if not digits.isdigit() or len(digits) < 7:
        await update.message.reply_text("⚠️ Iltimos, to'g'ri telefon raqam yuboring.\nMasalan: `+998901234567`", parse_mode="Markdown")
        return

    msg = await update.message.reply_text("🔍 Qidirilmoqda...")

    result = await lookup_phone(text)

    if result is None:
        await msg.edit_text(
            "❌ Bu raqamga ulangan Telegram topilmadi.\n\n"
            "_Sabab: Foydalanuvchi Telegram'dan foydalanmaydi yoki raqamini yashirgan._",
            parse_mode="Markdown"
        )
        return

    name = f"{result['first_name']} {result['last_name']}".strip()
    username_line = f"🔗 Username: @{result['username']}\n" if result['username'] else ""
    profile_link = f"tg://user?id={result['id']}"

    text_response = (
        f"✅ *Topildi!*\n\n"
        f"👤 Ism: {name}\n"
        f"{username_line}"
        f"🆔 ID: `{result['id']}`\n"
        f"📱 Raqam: `{result.get('phone') or 'yashirin'}`\n\n"
        f"[Profilni ochish]({profile_link})"
    )

    await msg.edit_text(text_response, parse_mode="Markdown")


async def main():
    # Telethon'ni ishga tushuramiz
    await start_telethon()

    # python-telegram-bot'ni ishga tushuramiz
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_phone))

    print("🤖 Bot ishlamoqda...")
    await app.run_polling()


if __name__ == "__main__":
    asyncio.run(main())
