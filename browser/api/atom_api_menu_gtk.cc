// Copyright (c) 2014 GitHub, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "browser/api/atom_api_menu_gtk.h"

#include "browser/native_window_gtk.h"
#include "common/v8/native_type_conversions.h"
#include "content/public/browser/render_widget_host_view.h"
#include "ui/gfx/point.h"
#include "ui/gfx/screen.h"

#include "common/v8/node_common.h"

namespace atom {

namespace api {

MenuGtk::MenuGtk(v8::Handle<v8::Object> wrapper)
    : Menu(wrapper) {
}

MenuGtk::~MenuGtk() {
}

void MenuGtk::Popup(NativeWindow* native_window) {
  uint32_t triggering_event_time;
  gfx::Point point;

  GdkEventButton* event = native_window->GetWebContents()->
      GetRenderWidgetHostView()->GetLastMouseDown();
  if (event) {
    triggering_event_time = event->time;
    point = gfx::Point(event->x_root, event->y_root);
  } else {
    triggering_event_time = GDK_CURRENT_TIME;
    point = gfx::Screen::GetNativeScreen()->GetCursorScreenPoint();
  }

  menu_gtk_.reset(new ::MenuGtk(this, model_.get()));
  menu_gtk_->PopupAsContext(point, triggering_event_time);
}

// static
void Menu::AttachToWindow(const v8::FunctionCallbackInfo<v8::Value>& args) {
  Menu* self = ObjectWrap::Unwrap<Menu>(args.This());
  if (self == NULL)
    return node::ThrowError("Menu is already destroyed");

  NativeWindow* native_window;
  if (!FromV8Arguments(args, &native_window))
    return node::ThrowTypeError("Bad argument");

  static_cast<NativeWindowGtk*>(native_window)->SetMenu(self->model_.get());
}

// static
Menu* Menu::Create(v8::Handle<v8::Object> wrapper) {
  return new MenuGtk(wrapper);
}

}  // namespace api

}  // namespace atom
