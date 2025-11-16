document.addEventListener("scroll", () => {
  document.querySelectorAll('.panel').forEach(panel => {
    const rect = panel.getBoundingClientRect();
    if (rect.top < window.innerHeight - 100) {
      panel.style.opacity = 1;
      panel.style.transform = "translateY(0px)";
    }
  });
});
