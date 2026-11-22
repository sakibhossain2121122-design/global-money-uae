package com.globalmoney.uae.demo

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
internal fun MethodCard(name: String, bn: Boolean, selected: Boolean? = null, enabled: Boolean = false, onSelect: () -> Unit = {}) {
    val action = if (selected == null) Modifier.semantics(mergeDescendants = true) { disabled() }
        else Modifier.clickable(enabled = enabled, onClick = onSelect)
    OutlinedCard(modifier = Modifier.fillMaxWidth().then(action), shape = RoundedCornerShape(18.dp)) {
        Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                Text(if (bn) "লোগো\nঅপেক্ষমাণ" else "Logo\npending", modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.labelSmall)
            }
            Column(Modifier.weight(1f)) {
                Text(name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(if (selected == null) {
                    if (bn) "পেমেন্ট উপলব্ধ নয়" else "Payments unavailable"
                } else {
                    if (bn) "শুধু পর্যালোচনার অনুরোধ" else "Review requests only"
                }, style = MaterialTheme.typography.bodySmall)
            }
            if (selected != null) RadioButton(selected = selected, enabled = enabled, onClick = onSelect)
        }
    }
}
