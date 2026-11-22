package com.globalmoney.uae.demo

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

internal enum class HomeAction { ADD_MONEY, SEND_MONEY, REQUESTS, HISTORY, PROFILE, SUPPORT, PAYMENT_METHODS, BENEFICIARIES }

@Composable
internal fun WalletHome(
    amounts: WalletAmounts, rate: String?, bn: Boolean, busy: Boolean,
    onRefresh: () -> Unit, onAction: (HomeAction) -> Unit
) {
    fun t(en: String, bengali: String) = if (bn) bengali else en
    val red = Color(0xFFB91C36)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = red)
    ) {
        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(t("YOUR WALLET", "আপনার ওয়ালেট"), color = Color.White, style = MaterialTheme.typography.labelLarge)
            Text(t("Available balance", "ব্যবহারযোগ্য ব্যালেন্স"), color = Color.White)
            Text(amounts.available?.let { "AED $it" } ?: "—",
                color = Color.White, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            HorizontalDivider(color = Color.White.copy(alpha = 0.35f), modifier = Modifier.padding(vertical = 4.dp))
            Text(t("Reserved balance", "সংরক্ষিত ব্যালেন্স") + ": " +
                (amounts.reserved?.let { "AED $it" } ?: "—"), color = Color.White)
        }
    }
    TextButton(enabled = !busy, onClick = onRefresh) { Text(t("Refresh wallet", "ওয়ালেট রিফ্রেশ করুন")) }
    Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(t("AED to BDT", "AED থেকে BDT"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(t("Exchange rate", "বিনিময় হার") + ": " + (rate ?: "—"))
            Text(t("Fee", "ফি") + ": " + t("Unavailable", "অনুপলব্ধ"))
            Text(t("Transfers are not available.", "অর্থ স্থানান্তর উপলব্ধ নয়।"), style = MaterialTheme.typography.bodySmall)
        }
    }
    Text(t("Explore", "সেবাসমূহ"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    val actions = listOf(
        Triple(HomeAction.ADD_MONEY, "Add Money", "অর্থ যোগ করুন"),
        Triple(HomeAction.SEND_MONEY, "Send Money", "অর্থ পাঠান"),
        Triple(HomeAction.REQUESTS, "My Requests", "আমার অনুরোধ"),
        Triple(HomeAction.HISTORY, "Transaction History", "লেনদেনের ইতিহাস"),
        Triple(HomeAction.PROFILE, "Profile", "প্রোফাইল"),
        Triple(HomeAction.SUPPORT, "Support", "সহায়তা"),
        Triple(HomeAction.PAYMENT_METHODS, "Payment Methods", "পেমেন্ট পদ্ধতি"),
        Triple(HomeAction.BENEFICIARIES, "Beneficiaries", "প্রাপক")
    )
    actions.chunked(2).forEach { pair ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            pair.forEach { (action, en, bengali) ->
                OutlinedCard(
                    onClick = { onAction(action) },
                    enabled = !busy,
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(Modifier.padding(18.dp).heightIn(min = 60.dp), verticalArrangement = Arrangement.Center) {
                        Text(t(en, bengali), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        if (action == HomeAction.SEND_MONEY) Text(t("Payouts unavailable", "পেআউট অনুপলব্ধ"), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
