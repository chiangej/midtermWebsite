// Anti-clickjacking: if this page is framed, break out.
if (window.top !== window.self) {
  window.top.location = window.self.location;
}
