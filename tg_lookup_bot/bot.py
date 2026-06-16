"""
Telegram Contact Info Bot
Kimdir yozsa - username va ID sini qaytaradi.
Telefon raqam uchun "Kontakt ulash" tugmasi chiqaradi.
"""

from telegram import Update, KeyboardButton, ReplyKeyboardMarkup
from telegram.ext import Updater, CommandHandler, MessageHandler, Filters, CallbackContext

BOT_TOKEN = ""  # @BotFather dan olgan token

def cmd_start(update: Update, context: CallbackContext):
    user = update.effective_user
    name = (user.first_name or "") + " " + (user.last_name or "")
    username = "@" + user.username if user.username else "username yoq"

    # Telefon raqam so'rash tugmasi
    button = KeyboardButton("📞 Raqamimni yuborish", request_contact=True)
    keyboard = ReplyKeyboardMarkup([[button]], resize_keyboard=True, one_time_keyboard=True)

    update.message.reply_text(
        "Salom, {}!\n\n"
        "Sizning ma'lumotlaringiz:\n"
        "👤 Ism: {}\n"
        "🔗 Username: {}\n"
        "🆔 ID: {}\n\n"
        "Telefon raqamingizni ham ko'rish uchun quyidagi tugmani bosing:".format(
            user.first_name, name.strip(), username, user.id
        ),
        reply_markup=keyboard
    )


def handle_contact(update: Update, context: CallbackContext):
    contact = update.message.contact
    user = update.effective_user
    username = "@" + user.username if user.username else "username yoq"

    update.message.reply_text(
        "✅ To'liq ma'lumot:\n\n"
        "👤 Ism: {} {}\n"
        "🔗 Username: {}\n"
        "🆔 ID: {}\n"
        "📞 Raqam: {}".format(
            contact.first_name or "",
            contact.last_name or "",
            username,
            user.id,
            contact.phone_number
        )
    )


def handle_message(update: Update, context: CallbackContext):
    user = update.effective_user
    username = "@" + user.username if user.username else "username yoq"
    name = (user.first_name or "") + " " + (user.last_name or "")

    button = KeyboardButton("📞 Raqamimni yuborish", request_contact=True)
    keyboard = ReplyKeyboardMarkup([[button]], resize_keyboard=True, one_time_keyboard=True)

    update.message.reply_text(
        "Siz haqingizda:\n\n"
        "👤 Ism: {}\n"
        "🔗 Username: {}\n"
        "🆔 ID: {}\n\n"
        "Raqamingizni ko'rish uchun tugmani bosing:".format(
            name.strip(), username, user.id
        ),
        reply_markup=keyboard
    )


def main():
    updater = Updater(BOT_TOKEN)
    dp = updater.dispatcher

    dp.add_handler(CommandHandler("start", cmd_start))
    dp.add_handler(MessageHandler(Filters.contact, handle_contact))
    dp.add_handler(MessageHandler(Filters.text & ~Filters.command, handle_message))

    print("Bot ishlamoqda...")
    updater.start_polling()
    updater.idle()


if __name__ == "__main__":
    main()
