package com.globalmoney.uae.demo

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil.compose.SubcomposeAsyncImage
import coil.decode.SvgDecoder
import coil.request.ImageRequest
import java.math.RoundingMode
import org.json.JSONArray

private val payoutLogos = mapOf(
    "bKash" to "https://upload.wikimedia.org/wikipedia/commons/5/5c/BKash_Logo_%28bangla%29.svg",
    "Nagad" to "https://www.logo.wine/a/logo/Nagad/Nagad-Logo.wine.svg",
    "Rocket" to "https://www.dutchbanglabank.com/img/mlogo.png",
)

internal fun estimateBdt(aed: String, rate: String): String? {
    if (!AddMoneyDraft.validAmount(aed)) return null
    val value = rate.toBigDecimalOrNull()?.takeIf { it.signum() > 0 } ?: return null
    return aed.toBigDecimal().multiply(value).setScale(2, RoundingMode.HALF_UP).toPlainString()
}

@Composable
internal fun PayoutTiles(enabled: Boolean, bankLabel: String, selected: String? = null, onSelect: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("bKash", "Nagad", "Rocket", "Bank").forEach { provider ->
            val title = if (provider == "Bank") bankLabel else provider
            val active = selected == provider
            val shape = RoundedCornerShape(14.dp)
            Surface(
                modifier = Modifier.weight(1f),
                shape = shape,
                color = if (active) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
            ) {
                Column(
                    Modifier.heightIn(min = 72.dp).selectable(
                        selected = active, enabled = enabled, role = Role.RadioButton, onClick = { onSelect(provider) },
                    ).padding(horizontal = 3.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    if (provider == "Bank") BankIcon() else MethodLogo(provider, payoutLogos[provider])
                    Text(title, style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center)
                }
            }
        }
    }
}

@Composable
internal fun MethodLogo(name: String, url: String?) {
    val fallback: @Composable () -> Unit = {
        Box(Modifier.size(width = 44.dp, height = 24.dp), contentAlignment = Alignment.Center) {
            Text(name.take(2).uppercase(), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
        }
    }
    if (url.isNullOrBlank() || !url.startsWith("https://", ignoreCase = true)) {
        fallback()
        return
    }
    val context = LocalContext.current
    val request = remember(context, url) {
        ImageRequest.Builder(context).data(url).decoderFactory(SvgDecoder.Factory()).build()
    }
    SubcomposeAsyncImage(
        model = request, contentDescription = null,
        modifier = Modifier.size(width = 44.dp, height = 24.dp),
        contentScale = ContentScale.Fit,
        loading = { fallback() },
        error = { fallback() },
    )
}

@Composable
private fun BankIcon() {
    val ink = MaterialTheme.colorScheme.primary
    Canvas(Modifier.size(24.dp)) {
        val stroke = 2.dp.toPx()
        fun line(x: Float, y: Float, x2: Float, y2: Float) {
            drawLine(ink, Offset(size.width * x, size.height * y), Offset(size.width * x2, size.height * y2), stroke)
        }
        line(0.1f, 0.35f, 0.5f, 0.12f)
        line(0.5f, 0.12f, 0.9f, 0.35f)
        line(0.1f, 0.4f, 0.9f, 0.4f)
        for (x in listOf(0.26f, 0.50f, 0.74f)) line(x, 0.47f, x, 0.76f)
        line(0.1f, 0.84f, 0.9f, 0.84f)
    }
}

@Composable
internal fun BankPicker(banks: JSONArray, selected: String, enabled: Boolean, label: String, emptyLabel: String, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(enabled = enabled && banks.length() > 0, onClick = { expanded = true }) {
            Text(selected.ifBlank { label })
        }
        DropdownMenu(expanded = expanded && enabled, onDismissRequest = { expanded = false }) {
            for (i in 0 until banks.length()) {
                val name = banks.getJSONObject(i).getString("name")
                DropdownMenuItem(text = { Text(name) }, onClick = { onSelect(name); expanded = false })
            }
        }
    }
    if (banks.length() == 0) Text(emptyLabel, style = MaterialTheme.typography.bodySmall)
}
