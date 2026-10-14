const SEARCH_KEY = "__zoroDocsSearchIndex";
const IS_MAC_PLATFORM = (() => {
  const forcePlatform = (() => {
    try {
      return (
        new URLSearchParams(window.location.search).get(
          "zoro-slider-platform",
        ) ||
        window.localStorage.getItem("zoro-slider-platform") ||
        ""
      );
    } catch {
      return "";
    }
  })();

  if (forcePlatform.toLowerCase() === "mac") return true;
  if (forcePlatform.toLowerCase() === "windows") return false;

  return /Mac|iPhone|iPad|iPod/i.test(
    `${(navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ""} ${navigator.userAgent || ""}`,
  );
})();

function hasShortcutPlatformTokens(value) {
  return (
    typeof value === "string" &&
    /(Ctrl|Alt|Windows key|Win key|Win\b)/i.test(value)
  );
}

function formatShortcutLabel(value) {
  if (!IS_MAC_PLATFORM || typeof value !== "string" || value === "") {
    return value;
  }

  return value
    .replace(/\bCtrl\b/gi, "⌘")
    .replace(/\bWindows key\b/gi, "⌘")
    .replace(/\bWin key\b/gi, "⌘")
    .replace(/\bWin\b/gi, "⌘")
    .replace(/\bCommand\b/gi, "⌘")
    .replace(/\bAlt\b/gi, "⌥")
    .replace(/\bOption\b/gi, "⌥")
    .replace(/\bShift\b/gi, "⇧")
    .replace(/\bLeft\b/gi, "←")
    .replace(/\bRight\b/gi, "→")
    .replace(/\bUp\b/gi, "↑")
    .replace(/\bDown\b/gi, "↓")
    .replace(/\bArrow Keys\b/gi, "← ↑ → ↓")
    .replace(/\bArrow key\b/gi, "← ↑ → ↓");
}

function initShortcutLabels() {
  if (!IS_MAC_PLATFORM) return;

  const updateTextNode = (node) => {
    if (
      !node ||
      node.nodeType !== 3 ||
      !hasShortcutPlatformTokens(node.nodeValue)
    )
      return;
    const formatted = formatShortcutLabel(node.nodeValue);
    if (formatted !== node.nodeValue) {
      node.nodeValue = formatted;
    }
  };

  document
    .querySelectorAll("[title], [aria-label], [placeholder]")
    .forEach((element) => {
      ["title", "aria-label", "placeholder"].forEach((attr) => {
        const value = element.getAttribute(attr);
        if (hasShortcutPlatformTokens(value)) {
          const formatted = formatShortcutLabel(value);
          if (formatted !== value) {
            element.setAttribute(attr, formatted);
          }
        }
      });
    });

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (
          !node ||
          !node.parentNode ||
          !hasShortcutPlatformTokens(node.nodeValue) ||
          (node.parentNode.nodeType === 1 &&
            /SCRIPT|STYLE|CODE|PRE/i.test(node.parentNode.tagName))
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  while (walker.nextNode()) {
    updateTextNode(walker.currentNode);
  }
}

function getSearchIndex() {
  try {
    return window[SEARCH_KEY] || [];
  } catch {
    return [];
  }
}

function initThemeToggle() {
  const toggle = document.querySelector("[data-theme-toggle]");
  if (!toggle) return;

  const label = toggle.querySelector("[data-theme-label]");

  const applyTheme = (isLight) => {
    document.documentElement.classList.toggle("light", isLight);
    if (label) {
      label.textContent = isLight ? "Dark" : "Light";
    }
    localStorage.setItem("zoro-docs-theme", isLight ? "light" : "dark");
  };

  toggle.addEventListener("click", () => {
    applyTheme(!document.documentElement.classList.contains("light"));
  });

  const saved = localStorage.getItem("zoro-docs-theme");
  if (
    saved === "light" ||
    (!saved && window.matchMedia("(prefers-color-scheme: light)").matches)
  ) {
    applyTheme(true);
  }
}

function initSearch() {
  const escapeHtml = (value) =>
    String(value).replace(
      /[&<>"]/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
        })[m],
    );

  const createRenderer = (dropdown) => (query) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      dropdown.classList.add("hidden");
      dropdown.innerHTML = "";
      return;
    }

    const matches = getSearchIndex()
      .filter((page) => {
        const blob =
          `${page.title} ${page.description} ${page.text}`.toLowerCase();
        return blob.includes(normalized);
      })
      .slice(0, 8);

    if (!matches.length) {
      dropdown.innerHTML = `<div style="padding:12px 14px;font-size:13px;color:var(--text-3)">No results for "${escapeHtml(query)}"</div>`;
    } else {
      dropdown.innerHTML = matches
        .map(
          (page) => `
        <a class="search-result-item" href="${page.href}">
          <div class="result-title">${escapeHtml(page.title)}</div>
          <div class="result-snippet">${escapeHtml(page.description)}</div>
        </a>
      `,
        )
        .join("");
    }

    dropdown.classList.remove("hidden");
  };

  const initSearchSurface = (input, dropdown) => {
    if (!input || !dropdown) return null;

    let searchTimeout = null;
    const renderResults = createRenderer(dropdown);

    input.addEventListener("input", (event) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => renderResults(event.target.value), 160);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        dropdown.classList.add("hidden");
      }
    });

    return {
      input,
      dropdown,
      renderResults,
      clear() {
        input.value = "";
        dropdown.classList.add("hidden");
        dropdown.innerHTML = "";
      },
    };
  };

  const inlineSearch = initSearchSurface(
    document.querySelector("[data-docs-search]"),
    document.querySelector("[data-search-results]"),
  );
  const modal = document.querySelector("[data-search-modal]");
  const modalInput = document.querySelector("[data-search-modal-input]");
  const modalResults = document.querySelector("[data-search-modal-results]");
  const modalSearch = initSearchSurface(modalInput, modalResults);
  const shortcutButton = document.querySelector("[data-search-shortcut]");
  const closeButtons = Array.from(
    document.querySelectorAll("[data-search-close]"),
  );

  const openModal = () => {
    if (!modal || !modalSearch) return;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    modalSearch.clear();
    requestAnimationFrame(() => modalSearch.input.focus());
  };

  const closeModal = () => {
    if (!modal || !modalSearch) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    modalSearch.clear();
  };

  if (shortcutButton) {
    shortcutButton.addEventListener("click", openModal);
  }

  closeButtons.forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrap")) {
      inlineSearch?.dropdown.classList.add("hidden");
    }
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openModal();
      return;
    }

    if (
      event.key === "Escape" &&
      modal &&
      !modal.classList.contains("hidden")
    ) {
      closeModal();
    }
  });
}

function initTocSpy() {
  const toc = document.querySelector("[data-docs-toc]");
  const main = document.querySelector("[data-docs-main]");
  if (!toc || !main) return;

  const headings = Array.from(main.querySelectorAll("h2[id], h3[id]"));
  if (!headings.length) return;

  // Resolve the active TOC link against the viewport because the page now
  // scrolls at the window level instead of using an internal scrollable <main>.
  const setActive = () => {
    let currentId = headings[0].id;

    headings.forEach((heading) => {
      if (heading.getBoundingClientRect().top <= 120) {
        currentId = heading.id;
      }
    });

    toc.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.classList.toggle(
        "active-toc",
        link.getAttribute("href") === `#${currentId}`,
      );
    });
  };

  window.addEventListener("scroll", setActive, { passive: true });
  window.addEventListener("hashchange", setActive);
  setTimeout(setActive, 100);
}

function initMobileNav() {
  const toggle = document.querySelector("[data-mobile-nav-toggle]");
  const sidebar = document.querySelector("[data-docs-sidebar]");
  const backdrop = document.querySelector("[data-mobile-nav-close]");

  if (!toggle || !sidebar || !backdrop) return;

  const closeNav = () => {
    document.body.classList.remove("docs-nav-open");
    toggle.setAttribute("aria-expanded", "false");
    backdrop.classList.add("hidden");
    backdrop.setAttribute("aria-hidden", "true");
  };

  const openNav = () => {
    document.body.classList.add("docs-nav-open");
    toggle.setAttribute("aria-expanded", "true");
    backdrop.classList.remove("hidden");
    backdrop.setAttribute("aria-hidden", "false");
  };

  toggle.addEventListener("click", () => {
    if (document.body.classList.contains("docs-nav-open")) {
      closeNav();
      return;
    }

    openNav();
  });

  backdrop.addEventListener("click", closeNav);

  sidebar.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeNav);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1024) {
      closeNav();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      document.body.classList.contains("docs-nav-open")
    ) {
      closeNav();
    }
  });
}

function lightBoxInit() {
  const images = document.querySelectorAll(".screenshot");
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  let currentIndex = 0;

  // Open lightbox
  images.forEach((img, index) => {
    img.addEventListener("click", function (e) {
      e.preventDefault();
      currentIndex = index;
      updateLightbox();
      lightbox.classList.add("active");
      document.body.style.overflow = "hidden";
    });
  });

  // Close lightbox
  function closeLightbox() {
    lightbox.classList.remove("active");
    document.body.style.overflow = "";
  }

  document
    .querySelector(".lightbox-close")
    .addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", function (e) {
    if (e.target === this) closeLightbox();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") navigate(-1);
    if (e.key === "ArrowRight") navigate(1);
  });

  // Navigation
  function navigate(direction) {
    currentIndex = (currentIndex + direction + images.length) % images.length;
    updateLightbox();
  }

  document
    .querySelector(".lightbox-nav.prev")
    .addEventListener("click", () => navigate(-1));
  document
    .querySelector(".lightbox-nav.next")
    .addEventListener("click", () => navigate(1));

  function updateLightbox() {
    const img = images[currentIndex];
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt || "Enlarged view";
  }
}

function init() {
  initShortcutLabels();
  initThemeToggle();
  initSearch();
  initTocSpy();
  initMobileNav();
  lightBoxInit();
}

document.addEventListener("DOMContentLoaded", init);
