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
from telethon.tl.types import InputPhoneContact, InputMediaContact
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


DEFAULT_COUNTRY_CODE = "998"  # O'zbekiston


def lookup_phone_sync(phone):
    phone = phone.strip().replace(" ", "").replace("-", "")

    if phone.startswith("+"):
        pass
    elif phone.startswith("00"):
        phone = "+" + phone[2:]
    elif phone.startswith("8") and len(phone) == 9:
        # 8 bilan boshlangan 9 xonali (masalan 8945542025 emas, lokal format)
        phone = "+" + DEFAULT_COUNTRY_CODE + phone
    elif len(phone) == 9:
        # Mamlakat kodisiz lokal raqam: 945542025
        phone = "+" + DEFAULT_COUNTRY_CODE + phone
    elif phone.startswith(DEFAULT_COUNTRY_CODE):
        phone = "+" + phone
    else:
        phone = "+" + phone

    async def _lookup():
        # 1-usul: ImportContacts
        try:
            contact = InputPhoneContact(client_id=0, phone=phone, first_name="lookup", last_name="")
            result = await client(ImportContactsRequest([contact]))
            if result.users:
                user = result.users[0]
                # Kontaktni o'chirmaymiz - shaxsiy Telegram kontaktlar ro'yxatida qoladi

                # Ishlaydigan kontakt kartani "Saved Messages" ga yuboramiz
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
        "Format: +998901234567\n\n"
        "Yoki kontakt kartani forward qiling — bu ko'proq hollarda ishlaydi!"
    )


def handle_forwarded_contact(update: Update, context: CallbackContext):
    contact = update.message.contact

    # Agar Telegram bu kontaktni allaqachon profilga bog'lagan bo'lsa,
    # contact.user_id orqali to'g'ridan-to'g'ri topiladi (privacy cheklovisiz)
    if contact.user_id:
        name = "{} {}".format(contact.first_name or "", contact.last_name or "").strip()
        profile_link = "tg://user?id={}".format(contact.user_id)
        update.message.reply_text(
            "Topildi (kontakt orqali)!\n\n"
            "Ism: {}\n"
            "ID: {}\n"
            "Raqam: {}\n"
            "Profil: {}".format(name, contact.user_id, contact.phone_number, profile_link)
        )
        return

    # Aks holda, oddiy raqam qidiruvini sinaymiz
    msg = update.message.reply_text("Kontaktda user_id yoq, raqam orqali qidirilmoqda...")
    result = lookup_phone_sync(contact.phone_number)

    if result is None:
        msg.edit_text("Topilmadi. Bu raqam yashirin yoki Telegram'da yoq.")
        return

    name = "{} {}".format(result["first_name"], result["last_name"]).strip()
    username_line = "Username: @{}\n".format(result["username"]) if result["username"] else ""
    profile_link = "tg://user?id={}".format(result["id"])
    msg.edit_text(
        "Topildi!\n\nIsm: {}\n{}ID: {}\nProfil: {}".format(
            name, username_line, result["id"], profile_link
        )
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
        "Profil: {}\n\n"
        "✅ Ishlaydigan kontakt karta sizning \"Saved Messages\" "
        "(O'zingizga yozish) bo'limiga yuborildi — uni ochib forward qiling.".format(
            name, username_line, result["id"], profile_link
        )
    )

    # Forward qilinadigan kontakt karta yuboramiz (chatda, lekin profilga bogʻlanmaydi)
    update.message.reply_contact(
        phone_number=result.get("phone") or text,
        first_name=result["first_name"] or "Lookup",
        last_name=result["last_name"] or "",
    )


def main():
    t = threading.Thread(target=start_telethon_thread, daemon=True)
    t.start()

    import time
    time.sleep(5)

    updater = Updater(BOT_TOKEN)
    dp = updater.dispatcher
    dp.add_handler(CommandHandler("start", cmd_start))
    dp.add_handler(MessageHandler(Filters.contact, handle_forwarded_contact))
    dp.add_handler(MessageHandler(Filters.text & ~Filters.command, handle_message))

    print("Bot ishlamoqda...")
    updater.start_polling()
    updater.idle()


if __name__ == "__main__":
    main()
