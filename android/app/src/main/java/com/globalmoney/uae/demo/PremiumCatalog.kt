package com.globalmoney.uae.demo

/** Shared product labels. These describe supported choices, not enabled money movement. */
internal object PremiumCatalog {
    val uaePaymentMethods = listOf("BOTIM Money", "e& money", "ADCB", "Emirates NBD", "ADIB", "Additional UAE bank")
    val beneficiaryProviders = listOf("bKash", "Nagad", "Rocket", "Upay", "Bank")

    fun homeTitle(bengali: Boolean) = if (bengali) "আপনার পরিবারের কাছে" else "Closer to your family"
    fun moneyNotice(bengali: Boolean) = if (bengali) "আর্থিক সেবা এখনো বন্ধ রয়েছে" else "Financial services are currently disabled"
    fun statusLabel(status: String, bengali: Boolean): String {
        if (status == "successful") return if (bengali) "সফল (স্টেজিং)" else "Successful (Staging)"
        if (!bengali) return status.replace('_', ' ')
        return when (status) {
            "pending" -> "অপেক্ষমাণ"
            "under_review" -> "পর্যালোচনাধীন"
            "rejected" -> "প্রত্যাখ্যাত"
            "cancelled" -> "বাতিল"
            "completed" -> "সম্পন্ন"
            else -> "অজানা অবস্থা"
        }
    }
}
