package com.tripguide.app;

import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // No stretch/bounce when pulling past the top or bottom, so the bottom tab bar never moves.
    View webView = getBridge().getWebView();
    webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
  }
}
