package com.globalmoney.uae.demo

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class MethodCardTest {
    @get:Rule val compose = createComposeRule()

    @Test fun requestCardUsesFallbackAndSelectsTheMethod() {
        var selected = 0
        compose.setContent {
            MaterialTheme { MethodCard("ADCB Bank", false, selected = false, enabled = true) { selected++ } }
        }
        compose.onNodeWithText("Logo\npending").assertExists()
        compose.onNodeWithText("Review requests only").assertExists()
        compose.onNodeWithText("ADCB Bank").performClick()
        compose.runOnIdle { assertEquals(1, selected) }
    }

    @Test fun payoutCardShowsUnavailableInBengali() {
        compose.setContent { MaterialTheme { MethodCard("bKash", true) } }
        compose.onNodeWithText("লোগো\nঅপেক্ষমাণ").assertExists()
        compose.onNodeWithText("পেমেন্ট উপলব্ধ নয়").assertExists()
        compose.onNodeWithText("bKash").assertIsNotEnabled()
    }
}
