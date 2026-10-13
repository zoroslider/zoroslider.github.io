(function () {
  var accordionResizeBound = false;
  var activeDemoRequestController = null;
  var showcaseTransitionChoices = [
    "moveHorizontal",
    "moveVertical",
    "fadeSlideHorizontal",
    "fadeSlideVertical",
    "flipHorizontal",
    "flipVertical",
    "cubeHorizontal",
    "cubeVertical",
    "roomHorizontal",
    "roomVertical",
    "newspaper",
    "sides",
    "slide",
    "glueHorizontal",
    "glueVertical",
    "foldHorizontal",
    "foldVertical",
    "unfoldHorizontal",
    "unfoldVertical",
    "carouselHorizontal",
    "carouselVertical",
    "scale",
    "scaleUpHorizontal",
    "scaleUpVertical",
    "scaleDownUp",
    "prismCube",
    "prismCubeVertical",
    "barShutter",
    "stripWave",
    "blindFold",
    "glassSweep",
    "blockZoom",
    "tubeTwist",
    "hardCut",
    "gridFlipDown",
    "gridFlipRight",
    "gridFlipRandom",
    "gridFlipReverseDiagonal",
    "gridFlipDiagonal",
    "gridFlipUpRight",
    "gridFlipDownLeft",
    "gridFlipCenterLine",
    "gridFlipOuterLine",
    "gridFlipCosine",
    "gridFlipCrossA",
    "gridFlipCrossB",
    "gridFlipCenterOut",
    "gridFlipEdgeIn",
    "sliceBox",
    "sliceBoxVertical",
    "sliceBoxHorizontal",
    "sliceBoxRandom",
  ];
  var transitionStyleChoices = [
    "slide",
    "imageBar",
    "roundSlide",
    "roundSlideImage",
    "navSlit",
    "navReveal",
    "thumbFlip",
    "circleSlide",
    "growPop",
    "diamond",
    "multiThumb",
  ];
  var transitionDotsChoices = [
    "fillup",
    "scaleup",
    "stroke",
    "fillin",
    "circlegrow",
    "dotstroke",
    "drawcircle",
    "smalldotstroke",
    "puff",
    "flip",
    "tooltip",
    "hop",
    "fall",
  ];
  var transitionControlIconChoices = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
  ];
  /**
   * Tracks the newest demo-control AJAX request. Older responses and cleanup
   * handlers are ignored so a stale request can never overwrite a newer choice.
   */
  var activeDemoRequestSequence = 0;

  function pickRandomDifferent(list, currentValue) {
    var filtered = list.filter(function (item) {
      return item !== currentValue;
    });
    var source = filtered.length ? filtered : list;

    return source[Math.floor(Math.random() * source.length)];
  }

  function getRandomShowcaseTransition(currentValue) {
    return pickRandomDifferent(
      showcaseTransitionChoices,
      currentValue || "moveHorizontal",
    );
  }

  function parseBool(value, fallback) {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    return value === true || value === "true";
  }

  /**
   * Demo control helper for progress UI.
   * The slider only renders linear/radial progress when autoplay is active,
   * so the selector must update autoplay together with the chosen indicator mode.
   */
  function applyProgressMode(progressMode, demoOptions, configOptions) {
    var resolvedMode = progressMode || "both";
    var baseOptions = configOptions || {};
    var progressEnabled = resolvedMode !== "off";
    var baseAutoPlay =
      typeof baseOptions.autoPlay === "boolean"
        ? baseOptions.autoPlay
        : demoOptions.autoPlay;

    demoOptions.progressBar =
      resolvedMode === "both" || resolvedMode === "linear";
    demoOptions.radialProgress =
      resolvedMode === "both" || resolvedMode === "radial";
    demoOptions.autoPlay = progressEnabled ? true : !!baseAutoPlay;
  }

  function getParam(params, name, fallback) {
    return params.get(name) || fallback;
  }

  function getBaseLayout(config) {
    return (
      (config.sliderOptions && config.sliderOptions.layout) ||
      (config.options && config.options.layout) ||
      config.defaultLayout ||
      "fixed"
    );
  }

  function getRequestedLayoutValue(config, params) {
    var sliderOptions =
      (config && (config.sliderOptions || config.options)) || {};
    var carouselOptions = sliderOptions.carousel || {};

    if (params && params.has("layout")) {
      return params.get("layout");
    }

    if (carouselOptions.active) {
      if (carouselOptions.type === "showcase") return "carouselShowcase";
      if (carouselOptions.type === "gallery3d") return "carouselGallery3d";
      return "carouselNormal";
    }

    return getBaseLayout(config);
  }

  function applyLayoutControl(config, params, demoOptions) {
    var layoutValue = getRequestedLayoutValue(config, params);
    var carouselOptions = window.jQuery.extend(
      true,
      {},
      demoOptions.carousel || {},
    );

    if (
      layoutValue === "carouselNormal" ||
      layoutValue === "carouselShowcase" ||
      layoutValue === "carouselGallery3d"
    ) {
      demoOptions.layout = getBaseLayout(config);
      carouselOptions.active = true;
      carouselOptions.visibleSlides = carouselOptions.visibleSlides || 3;

      if (layoutValue === "carouselShowcase") {
        carouselOptions.type = "showcase";
        carouselOptions.centerMode = true;
      } else if (layoutValue === "carouselGallery3d") {
        carouselOptions.type = "gallery3d";
        carouselOptions.centerMode = true;
        demoOptions.loop = true;
      } else {
        carouselOptions.type = "normal";
        carouselOptions.centerMode = false;
      }
    } else {
      demoOptions.layout = layoutValue;
      carouselOptions.active = false;
    }

    demoOptions.carousel = carouselOptions;
  }

  function getInlineConfig() {
    var configScript = document.querySelector("[data-demo-config-json]");

    if (!configScript) {
      return null;
    }

    try {
      return JSON.parse(configScript.textContent || "");
    } catch (error) {
      console.error("ZoroSlider demo config JSON could not be parsed.", error);
      return null;
    }
  }

  function setInlineConfig(config) {
    var configScript = document.querySelector("[data-demo-config-json]");
    var configType = configScript
      ? configScript.getAttribute("data-demo-config-type")
      : "demo";

    if (configScript && config) {
      configScript.textContent = JSON.stringify(config);
    }

    window.ZoroDemoConfig = configType === "demo" ? config : null;
    window.ZoroExampleConfig = configType === "example" ? config : null;
  }

  function syncControls(form, params, options) {
    Array.prototype.forEach.call(form.elements, function (field) {
      if (!field.name) {
        return;
      }

      if (params.has(field.name)) {
        field.value = params.get(field.name);
        return;
      }

      if (options && options[field.name] !== undefined) {
        field.value =
          options[field.name] === null ? "" : String(options[field.name]);
      }
    });
  }

  function serializeFormParams(form) {
    var params = new URLSearchParams(window.location.search);

    Array.prototype.forEach.call(form.elements, function (field) {
      if (!field.name) {
        return;
      }

      params.set(field.name, field.value);
    });

    return params;
  }

  function buildControlUrl(form) {
    var nextUrl = new URL(window.location.href);
    nextUrl.search = serializeFormParams(form).toString();
    return nextUrl;
  }

  function setFormBusy(form, busy) {
    if (!form) {
      return;
    }

    Array.prototype.forEach.call(form.elements, function (field) {
      field.disabled = !!busy;
    });

    form.classList.toggle("is-loading", !!busy);
  }

  function waitForPlugin(callback, attempts) {
    if (window.jQuery && window.jQuery.fn && window.jQuery.fn.zoroSlider) {
      callback(window.jQuery);
      return;
    }

    if (attempts <= 0) {
      console.error(
        "ZoroSlider demo could not initialize because the plugin was not loaded.",
      );
      return;
    }

    window.setTimeout(function () {
      waitForPlugin(callback, attempts - 1);
    }, 50);
  }

  function getActiveLayout(config, params) {
    var requestedLayout;

    if (!config) {
      return "";
    }

    requestedLayout = getRequestedLayoutValue(config, params);

    if (
      requestedLayout === "carouselNormal" ||
      requestedLayout === "carouselShowcase" ||
      requestedLayout === "carouselGallery3d"
    ) {
      return getBaseLayout(config);
    }

    return requestedLayout;
  }

  function syncStickyHeaderHeight() {
    var header = document.querySelector("[data-demo-site-header]");
    var height =
      header && !header.classList.contains("hidden")
        ? Math.ceil(header.getBoundingClientRect().height)
        : 0;

    document.documentElement.style.setProperty(
      "--demo-sticky-header-height",
      height + "px",
    );
  }

  function syncSiteHeaderVisibility(config, params) {
    var header = document.querySelector("[data-demo-site-header]");
    var layout = getActiveLayout(config, params);

    if (!header) {
      return;
    }

    header.classList.toggle("hidden", layout === "fullScreen");
    header.classList.toggle("grid", layout !== "fullScreen");
    syncStickyHeaderHeight();
  }

  function setAccordionState(accordion, expanded) {
    var trigger = accordion.querySelector(".demo-accordion-trigger");
    var panel = accordion.querySelector(".demo-accordion-panel");

    if (!trigger || !panel) {
      return;
    }

    trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
    panel.classList.toggle("active", expanded);
    panel.style.maxHeight = expanded ? panel.scrollHeight + "px" : "0px";
  }

  function initCodeCopyButtons() {
    var buttons = document.querySelectorAll(".demo-copy-btn");
    var copyDefaultIcon =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-copy" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>';
    var copySuccessIcon =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" class="icon icon-tabler icons-tabler-filled icon-tabler-copy-check" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M18.333 6a3.667 3.667 0 0 1 3.667 3.667v8.666a3.667 3.667 0 0 1 -3.667 3.667h-8.666a3.667 3.667 0 0 1 -3.667 -3.667v-8.666a3.667 3.667 0 0 1 3.667 -3.667zm-3.333 -4c1.094 0 1.828 .533 2.374 1.514a1 1 0 1 1 -1.748 .972c-.221 -.398 -.342 -.486 -.626 -.486h-10c-.548 0 -1 .452 -1 1v9.998c0 .32 .154 .618 .407 .805l.1 .065a1 1 0 1 1 -.99 1.738a3 3 0 0 1 -1.517 -2.606v-10c0 -1.652 1.348 -3 3 -3zm1.293 9.293l-3.293 3.292l-1.293 -1.292a1 1 0 0 0 -1.414 1.414l2 2a1 1 0 0 0 1.414 0l4 -4a1 1 0 0 0 -1.414 -1.414" /></svg>';

    function setCopyButtonContent(button, iconMarkup, label) {
      button.innerHTML = iconMarkup + "<span>" + label + "</span>";
    }

    Array.prototype.forEach.call(buttons, function (button) {
      if (button.getAttribute("data-copy-bound") === "true") {
        return;
      }

      button.setAttribute("data-copy-bound", "true");
      setCopyButtonContent(
        button,
        copyDefaultIcon,
        button.getAttribute("data-copy-default-label") || "Copy",
      );

      button.addEventListener("click", function () {
        var code = button.parentNode
          ? button.parentNode.querySelector("code")
          : null;
        var text = code ? code.textContent : "";

        if (!text) {
          return;
        }

        navigator.clipboard.writeText(text).then(function () {
          var defaultLabel =
            button.getAttribute("data-copy-default-label") || "Copy";
          var successLabel =
            button.getAttribute("data-copy-success-label") || "Copied";

          setCopyButtonContent(button, copySuccessIcon, successLabel);
          button.classList.add("is-copied");

          window.setTimeout(function () {
            setCopyButtonContent(button, copyDefaultIcon, defaultLabel);
            button.classList.remove("is-copied");
          }, 1600);
        });
      });
    });
  }

  function highlightCodeBlocks() {
    if (window.Prism && typeof window.Prism.highlightAll === "function") {
      window.Prism.highlightAll();
    }
  }

  function syncExpandedAccordions() {
    var accordions = document.querySelectorAll("[data-demo-accordion]");

    Array.prototype.forEach.call(accordions, function (accordion) {
      var trigger = accordion.querySelector(".demo-accordion-trigger");

      if (trigger && trigger.getAttribute("aria-expanded") === "true") {
        setAccordionState(accordion, true);
      }
    });
  }

  function initAccordions() {
    var accordions = document.querySelectorAll("[data-demo-accordion]");

    Array.prototype.forEach.call(accordions, function (accordion) {
      var trigger = accordion.querySelector(".demo-accordion-trigger");

      setAccordionState(accordion, true);

      if (!trigger) {
        return;
      }

      if (trigger.getAttribute("data-accordion-bound") === "true") {
        return;
      }

      trigger.setAttribute("data-accordion-bound", "true");
      trigger.addEventListener("click", function () {
        var expanded = trigger.getAttribute("aria-expanded") === "true";
        setAccordionState(accordion, !expanded);
      });
    });

    if (!accordionResizeBound) {
      accordionResizeBound = true;
      window.addEventListener("resize", syncExpandedAccordions);
    }
  }

  function setFaqState(item, expanded) {
    var panel = item.querySelector("[data-index-faq-panel]");

    if (!panel) {
      return;
    }

    if (expanded) {
      item.removeAttribute("data-index-faq-closing");
      item.open = true;
      panel.style.maxHeight = "0px";
      panel.style.opacity = "0";

      window.requestAnimationFrame(function () {
        panel.style.maxHeight = panel.scrollHeight + "px";
        panel.style.opacity = "1";
      });
      return;
    }

    item.setAttribute("data-index-faq-closing", "true");
    panel.style.maxHeight = panel.scrollHeight + "px";
    panel.style.opacity = "1";

    window.requestAnimationFrame(function () {
      panel.style.maxHeight = "0px";
      panel.style.opacity = "0";
    });
  }

  function syncOpenFaqs() {
    var items = document.querySelectorAll("[data-index-faq][open]");

    Array.prototype.forEach.call(items, function (item) {
      var panel = item.querySelector("[data-index-faq-panel]");

      if (panel) {
        panel.style.maxHeight = panel.scrollHeight + "px";
      }
    });
  }

  function initFaqAccordions() {
    var items = document.querySelectorAll("[data-index-faq]");

    Array.prototype.forEach.call(items, function (item) {
      var trigger = item.querySelector("[data-index-faq-trigger]");
      var panel = item.querySelector("[data-index-faq-panel]");

      if (
        !trigger ||
        !panel ||
        item.getAttribute("data-index-faq-bound") === "true"
      ) {
        return;
      }

      item.setAttribute("data-index-faq-bound", "true");
      panel.style.maxHeight = item.open ? panel.scrollHeight + "px" : "0px";
      panel.style.opacity = item.open ? "1" : "0";

      trigger.addEventListener("click", function (event) {
        event.preventDefault();
        setFaqState(
          item,
          item.hasAttribute("data-index-faq-closing") || !item.open,
        );
      });

      panel.addEventListener("transitionend", function (event) {
        if (
          event.propertyName !== "max-height" ||
          !item.hasAttribute("data-index-faq-closing")
        ) {
          return;
        }

        item.removeAttribute("data-index-faq-closing");
        item.open = false;
      });
    });

    if (!window.__zoroDemoFaqResizeBound) {
      window.__zoroDemoFaqResizeBound = true;
      window.addEventListener("resize", syncOpenFaqs);
    }
  }

  function initQuicklinks($) {
    var quicklinks = $("[data-quicklinks]");
    var title = $("[data-quicklinks-title]");
    var panels = $("[data-quicklinks-panel]");
    var toggles = $("[data-quicklinks-toggle]");
    var close = $("[data-quicklinks-close]");
    var scrollRoot = quicklinks.find(".quicklinks-scroll").get(0);
    var lazyObserver = null;

    if (!quicklinks.length || !toggles.length) {
      return;
    }

    if (quicklinks.attr("data-quicklinks-bound") === "true") {
      return;
    }

    quicklinks.attr("data-quicklinks-bound", "true");

    function loadQuicklinkImage(image) {
      var src = image.getAttribute("data-src");

      if (!src || image.getAttribute("data-loaded") === "true") {
        return;
      }

      image.setAttribute("data-loaded", "true");
      image.addEventListener(
        "load",
        function () {
          image.classList.add("is-loaded");
        },
        { once: true },
      );
      image.src = src;
      image.removeAttribute("data-src");
    }

    function observeQuicklinkImages(panel) {
      var images = panel.find("[data-quicklinks-lazy-img]").filter(function () {
        return this.getAttribute("data-loaded") !== "true";
      });

      if (!images.length) {
        return;
      }

      if (!("IntersectionObserver" in window) || !scrollRoot) {
        images.each(function () {
          loadQuicklinkImage(this);
        });
        return;
      }

      if (lazyObserver) {
        lazyObserver.disconnect();
      }

      lazyObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) {
              return;
            }

            loadQuicklinkImage(entry.target);
            lazyObserver.unobserve(entry.target);
          });
        },
        {
          root: scrollRoot,
          rootMargin: "160px 0px",
          threshold: 0.01,
        },
      );

      images.each(function () {
        lazyObserver.observe(this);
      });
    }

    function openQuicklinks(panelName) {
      quicklinks.addClass("is-open").attr({
        "data-active-panel": panelName,
        "aria-hidden": "false",
      });
      $("body").addClass("quicklinks-open");
    }

    function closeQuicklinks() {
      quicklinks.removeClass("is-open").attr("aria-hidden", "true");
      $("body").removeClass("quicklinks-open");
    }

    toggles.on("click", function (event) {
      var panelName = $(this).attr("data-quicklinks-toggle");
      var panel = $('[data-quicklinks-panel="' + panelName + '"]');
      var isOpen = quicklinks.hasClass("is-open");
      var currentPanel = quicklinks.attr("data-active-panel");

      event.preventDefault();

      panels.hide();
      panel.css("display", "grid");
      title.text(
        panelName === "examples"
          ? "Examples shortcut links"
          : "Demos shortcut links",
      );

      if (isOpen && currentPanel === panelName) {
        closeQuicklinks();
        return;
      }

      openQuicklinks(panelName);
      observeQuicklinkImages(panel);
    });

    close.on("click", function () {
      closeQuicklinks();
    });

    $(document).on("keydown.quicklinks", function (event) {
      if (event.key === "Escape" && quicklinks.hasClass("is-open")) {
        closeQuicklinks();
      }
    });
  }

  function initDemoCategoryFilter() {
    var filter = document.querySelector("[data-demo-category-filter]");
    var cards = document.querySelectorAll("[data-demo-category]");
    var empty = document.querySelector("[data-demo-category-empty]");

    if (!filter || !cards.length) {
      return;
    }

    if (filter.getAttribute("data-demo-filter-bound") === "true") {
      return;
    }

    filter.setAttribute("data-demo-filter-bound", "true");

    function applyFilter() {
      var selected = filter.value;
      var visibleCount = 0;

      Array.prototype.forEach.call(cards, function (card) {
        var matches =
          selected === "all" ||
          card.getAttribute("data-demo-category") === selected;
        card.classList.toggle("hidden", !matches);

        if (matches) {
          visibleCount += 1;
        }
      });

      if (empty) {
        empty.classList.toggle("hidden", visibleCount !== 0);
      }
    }

    filter.addEventListener("change", applyFilter);
    applyFilter();
  }

  /**
   * Carousel demos/examples should stay image-focused. Strip layers and pad the
   * slide list to a usable minimum so carousel layouts always have enough items.
   */
  function prepareCarouselSlides(slider) {
    var sliderList = slider ? slider.querySelector(".zoro-slider") : null;
    var sourceSlides;
    var cloneIndex = 0;

    if (!sliderList) {
      return;
    }

    Array.prototype.forEach.call(sliderList.children, function (slide) {
      Array.prototype.forEach.call(
        slide.querySelectorAll(".zoro-slider-layer"),
        function (layer) {
          layer.remove();
        },
      );
    });

    sourceSlides = Array.prototype.slice.call(sliderList.children);

    if (!sourceSlides.length) {
      return;
    }

    while (sliderList.children.length < 6) {
      var clone =
        sourceSlides[cloneIndex % sourceSlides.length].cloneNode(true);

      Array.prototype.forEach.call(
        clone.querySelectorAll(".zoro-slider-layer"),
        function (layer) {
          layer.remove();
        },
      );

      sliderList.appendChild(clone);
      cloneIndex += 1;
    }
  }

  /**
   * Demo AJAX replaces the page body content only, so the active plugin instance
   * must be destroyed first to clear timers, window handlers, and plugin data.
   */
  function destroyCurrentSlider($) {
    var slider = $("[data-zoro-demo], [data-zoro-example]");

    if (!slider.length || !slider.data("plugin_zoro_slider")) {
      return;
    }

    slider.zoroSlider("destroy");
  }

  /**
   * Pulls the server-rendered main demo content and config JSON out of the AJAX response
   * so the refreshed page stays authoritative instead of rebuilding HTML client-side.
   */
  function replaceDemoContentFromHtml(htmlText) {
    var parser = new window.DOMParser();
    var parsedDocument = parser.parseFromString(htmlText, "text/html");
    var nextRoot = parsedDocument.querySelector("[data-demo-ajax-root]");
    var currentRoot = document.querySelector("[data-demo-ajax-root]");
    var nextConfigScript = parsedDocument.querySelector(
      "[data-demo-config-json]",
    );
    var currentConfigScript = document.querySelector("[data-demo-config-json]");

    if (
      !nextRoot ||
      !currentRoot ||
      !nextConfigScript ||
      !currentConfigScript
    ) {
      return false;
    }

    document.title = parsedDocument.title || document.title;
    currentRoot.replaceWith(document.importNode(nextRoot, true));
    currentConfigScript.replaceWith(
      document.importNode(nextConfigScript, true),
    );

    return true;
  }

  function scrollToUpdatedSlider() {
    var target = document.querySelector(
      "[data-zoro-demo], [data-zoro-example], .demo-slider",
    );

    if (!target) {
      return;
    }

    window.requestAnimationFrame(function () {
      var header = document.querySelector("[data-demo-site-header]");
      var headerOffset = header ? header.getBoundingClientRect().height : 0;
      var top =
        target.getBoundingClientRect().top +
        window.pageYOffset -
        headerOffset -
        16;

      window.scrollTo({
        top: Math.max(0, top),
        behavior: "smooth",
      });
    });
  }

  /**
   * Fetches the same static demo page with updated query params, swaps the main content,
   * and then re-initializes the slider so controls feel instant without a hard reload.
   */
  function fetchDemoState(url, $, fallbackForm, options) {
    var requestSequence = activeDemoRequestSequence + 1;
    var fetchOptions = options || {};
    var shouldScrollToSlider =
      fetchOptions.scrollToSlider ||
      (fallbackForm && fallbackForm.hasAttribute("data-demo-controls"));

    activeDemoRequestSequence = requestSequence;

    if (activeDemoRequestController) {
      activeDemoRequestController.abort();
    }

    activeDemoRequestController = new window.AbortController();
    setFormBusy(fallbackForm, true);

    return window
      .fetch(url.toString(), {
        method: "GET",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
        },
        signal: activeDemoRequestController.signal,
      })
      .then(function (response) {
        if (!response.ok) {
          throw new Error(
            "Demo AJAX request failed with status " + response.status,
          );
        }

        return response.text();
      })
      .then(function (htmlText) {
        if (requestSequence !== activeDemoRequestSequence) {
          return;
        }

        destroyCurrentSlider($);

        if (!replaceDemoContentFromHtml(htmlText)) {
          throw new Error(
            "Demo AJAX response did not contain replaceable content.",
          );
        }

        window.history.replaceState({}, "", url.toString());
        setInlineConfig(getInlineConfig());
        initializeDemoContent($, new URLSearchParams(url.search));
        if (shouldScrollToSlider) {
          scrollToUpdatedSlider();
        }
      })
      .catch(function (error) {
        if (error.name === "AbortError") {
          return;
        }

        if (requestSequence !== activeDemoRequestSequence) {
          return;
        }

        console.error(error);
        window.location.href = url.toString();
      })
      .finally(function () {
        if (requestSequence !== activeDemoRequestSequence) {
          return;
        }

        activeDemoRequestController = null;
        setFormBusy(
          document.querySelector("[data-demo-controls]") || fallbackForm,
          false,
        );
      });
  }

  function bindDemoControls(form, $, demoOptions) {
    if (!form) {
      return;
    }

    syncControls(
      form,
      new URLSearchParams(window.location.search),
      demoOptions,
    );

    if (form.getAttribute("data-demo-controls-bound") === "true") {
      return;
    }

    form.setAttribute("data-demo-controls-bound", "true");

    form.addEventListener("change", function (event) {
      event.preventDefault();
      fetchDemoState(buildControlUrl(form), $, form);
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      fetchDemoState(buildControlUrl(form), $, form);
    });
  }

  function initTransitionButtons($) {
    var showcase = document.querySelector("[data-transition-buttons]");
    var params = new URLSearchParams(window.location.search);
    var inlineConfig = getInlineConfig() || {};
    var activeTransition =
      params.get("transition") ||
      (inlineConfig.sliderOptions || {}).transition ||
      "moveHorizontal";

    if (!showcase) {
      return;
    }

    Array.prototype.forEach.call(
      showcase.querySelectorAll("[data-transition-value]"),
      function (button) {
        button.classList.toggle(
          "is-active",
          button.getAttribute("data-transition-value") === activeTransition,
        );

        if (button.getAttribute("data-transition-bound") === "true") {
          return;
        }

        button.setAttribute("data-transition-bound", "true");
        button.addEventListener("click", function (event) {
          var nextUrl = new URL(window.location.href);
          var nextParams = new URLSearchParams(nextUrl.search);
          var currentControlStyle = nextParams.get("controlStyle") || "growPop";
          var currentDotsStyle = nextParams.get("dotsStyle") || "fillup";
          var currentControlIcon = nextParams.get("controlIcon") || "1";

          event.preventDefault();
          nextParams.set("layout", "fullWidthScoped");
          nextParams.set(
            "transition",
            button.getAttribute("data-transition-value"),
          );
          nextParams.set("controls", "true");
          nextParams.set("dotsNav", "true");
          nextParams.set("thumbsNav", "false");
          nextParams.set("numbersNav", "false");
          nextParams.set("progressMode", "off");
          nextParams.set(
            "controlStyle",
            pickRandomDifferent(transitionStyleChoices, currentControlStyle),
          );
          nextParams.set(
            "dotsStyle",
            pickRandomDifferent(transitionDotsChoices, currentDotsStyle),
          );
          nextParams.set(
            "controlIcon",
            pickRandomDifferent(
              transitionControlIconChoices,
              currentControlIcon,
            ),
          );
          nextUrl.search = nextParams.toString();
          fetchDemoState(nextUrl, $, null, { scrollToSlider: true });
        });
      },
    );
  }

  function initControlsButtons($) {
    var styleShowcase = document.querySelector("[data-controls-style-buttons]");
    var iconShowcase = document.querySelector("[data-controls-icon-buttons]");
    var params = new URLSearchParams(window.location.search);
    var inlineConfig = getInlineConfig() || {};
    var inlineOptions = inlineConfig.sliderOptions || {};
    var activeControlStyle =
      params.get("controlStyle") || inlineOptions.controlStyle || "growPop";
    var activeControlIcon = String(
      params.get("controlIcon") || inlineOptions.controlIcon || "1",
    );

    function bindAjaxButton(button, paramName, paramValue) {
      if (button.getAttribute("data-controls-bound") === "true") {
        return;
      }

      button.setAttribute("data-controls-bound", "true");
      button.addEventListener("click", function (event) {
        var nextUrl = new URL(window.location.href);
        var nextParams = new URLSearchParams(nextUrl.search);
        var inlineDotsStyle = inlineOptions.dotsStyle || "fillup";
        var inlineTransition = inlineOptions.transition || "moveHorizontal";

        event.preventDefault();
        nextParams.set("layout", "fullWidthScoped");
        nextParams.set(
          "transition",
          getRandomShowcaseTransition(
            nextParams.get("transition") || inlineTransition,
          ),
        );
        nextParams.set("controls", "true");
        nextParams.set("dotsNav", "true");
        nextParams.set("thumbsNav", "false");
        nextParams.set("numbersNav", "false");
        nextParams.set("progressMode", "off");
        nextParams.set(
          "dotsStyle",
          nextParams.get("dotsStyle") || inlineDotsStyle,
        );
        nextParams.set(paramName, paramValue);
        nextUrl.search = nextParams.toString();
        fetchDemoState(nextUrl, $, null, { scrollToSlider: true });
      });
    }

    if (styleShowcase) {
      Array.prototype.forEach.call(
        styleShowcase.querySelectorAll("[data-controls-style-value]"),
        function (button) {
          button.classList.toggle(
            "is-active",
            button.getAttribute("data-controls-style-value") ===
              activeControlStyle,
          );
          bindAjaxButton(
            button,
            "controlStyle",
            button.getAttribute("data-controls-style-value"),
          );
        },
      );
    }

    if (iconShowcase) {
      Array.prototype.forEach.call(
        iconShowcase.querySelectorAll("[data-controls-icon-value]"),
        function (button) {
          button.classList.toggle(
            "is-active",
            button.getAttribute("data-controls-icon-value") ===
              activeControlIcon,
          );
          bindAjaxButton(
            button,
            "controlIcon",
            button.getAttribute("data-controls-icon-value"),
          );
        },
      );
    }
  }

  function initDotsButtons($) {
    var dotsStyleShowcase = document.querySelector("[data-dots-style-buttons]");
    var numbersStyleShowcase = document.querySelector(
      "[data-numbers-style-buttons]",
    );
    var dotsTooltipShowcase = document.querySelector(
      "[data-dots-tooltip-buttons]",
    );
    var numbersTooltipShowcase = document.querySelector(
      "[data-numbers-tooltip-buttons]",
    );
    var params = new URLSearchParams(window.location.search);
    var inlineConfig = getInlineConfig() || {};
    var inlineOptions = inlineConfig.sliderOptions || {};
    var activeDotsNav = params.has("dotsNav")
      ? parseBool(params.get("dotsNav"), !!inlineOptions.dotsNav)
      : !!inlineOptions.dotsNav;
    var activeNumbersNav = params.has("numbersNav")
      ? parseBool(params.get("numbersNav"), !!inlineOptions.numbersNav)
      : !!inlineOptions.numbersNav;
    var activeDotsStyle =
      params.get("dotsStyle") || inlineOptions.dotsStyle || "fillup";
    var activeNumbersStyle =
      params.get("numbersStyle") || inlineOptions.numbersStyle || "fillup";
    var activeDotsTooltipStyle =
      params.get("dotsTooltipStyle") ||
      inlineOptions.dotsTooltipStyle ||
      "none";
    var activeNumbersTooltipStyle =
      params.get("numbersTooltipStyle") ||
      inlineOptions.numbersTooltipStyle ||
      "none";

    function bindDotsAjaxButton(button, callback) {
      if (button.getAttribute("data-dots-bound") === "true") {
        return;
      }

      button.setAttribute("data-dots-bound", "true");
      button.addEventListener("click", function (event) {
        var nextUrl = new URL(window.location.href);
        var nextParams = new URLSearchParams(nextUrl.search);
        var inlineTransition = inlineOptions.transition || "moveHorizontal";
        var inlineControlStyle = inlineOptions.controlStyle || "growPop";
        var inlineControlIcon = String(inlineOptions.controlIcon || "1");

        event.preventDefault();
        nextParams.set("layout", "fullWidthScoped");
        nextParams.set(
          "transition",
          getRandomShowcaseTransition(
            nextParams.get("transition") || inlineTransition,
          ),
        );
        nextParams.set("controls", "true");
        nextParams.set(
          "controlStyle",
          nextParams.get("controlStyle") || inlineControlStyle,
        );
        nextParams.set(
          "controlIcon",
          nextParams.get("controlIcon") || inlineControlIcon,
        );
        nextParams.set("thumbsNav", "false");
        nextParams.set("progressMode", "off");
        callback(nextParams);
        nextUrl.search = nextParams.toString();
        fetchDemoState(nextUrl, $, null, { scrollToSlider: true });
      });
    }

    if (dotsStyleShowcase) {
      Array.prototype.forEach.call(
        dotsStyleShowcase.querySelectorAll("[data-dots-style-value]"),
        function (button) {
          button.classList.toggle(
            "is-active",
            activeDotsNav &&
              button.getAttribute("data-dots-style-value") === activeDotsStyle,
          );
          bindDotsAjaxButton(button, function (nextParams) {
            nextParams.set("dotsNav", "true");
            nextParams.set(
              "dotsStyle",
              button.getAttribute("data-dots-style-value"),
            );
            nextParams.set("numbersNav", "false");
            nextParams.delete("numbersStyle");
          });
        },
      );
    }

    if (numbersStyleShowcase) {
      Array.prototype.forEach.call(
        numbersStyleShowcase.querySelectorAll("[data-numbers-style-value]"),
        function (button) {
          button.classList.toggle(
            "is-active",
            activeNumbersNav &&
              button.getAttribute("data-numbers-style-value") ===
                activeNumbersStyle,
          );
          bindDotsAjaxButton(button, function (nextParams) {
            nextParams.set("numbersNav", "true");
            nextParams.set(
              "numbersStyle",
              button.getAttribute("data-numbers-style-value"),
            );
            nextParams.set("dotsNav", "false");
            nextParams.delete("dotsStyle");
          });
        },
      );
    }

    if (dotsTooltipShowcase) {
      Array.prototype.forEach.call(
        dotsTooltipShowcase.querySelectorAll("[data-dots-tooltip-value]"),
        function (button) {
          button.classList.toggle(
            "is-active",
            activeDotsNav &&
              activeDotsStyle === "tooltip" &&
              button.getAttribute("data-dots-tooltip-value") ===
                activeDotsTooltipStyle,
          );
          bindDotsAjaxButton(button, function (nextParams) {
            nextParams.set("dotsNav", "true");
            nextParams.set("dotsStyle", "tooltip");
            nextParams.set(
              "dotsTooltipStyle",
              button.getAttribute("data-dots-tooltip-value"),
            );
            nextParams.set("numbersNav", "false");
            nextParams.delete("numbersStyle");
          });
        },
      );
    }

    if (numbersTooltipShowcase) {
      Array.prototype.forEach.call(
        numbersTooltipShowcase.querySelectorAll("[data-numbers-tooltip-value]"),
        function (button) {
          button.classList.toggle(
            "is-active",
            activeNumbersNav &&
              activeNumbersStyle === "tooltip" &&
              button.getAttribute("data-numbers-tooltip-value") ===
                activeNumbersTooltipStyle,
          );
          bindDotsAjaxButton(button, function (nextParams) {
            nextParams.set("numbersNav", "true");
            nextParams.set("numbersStyle", "tooltip");
            nextParams.set(
              "numbersTooltipStyle",
              button.getAttribute("data-numbers-tooltip-value"),
            );
            nextParams.set("dotsNav", "false");
            nextParams.delete("dotsStyle");
          });
        },
      );
    }
  }

  function executeApiShowcaseAction($, sliderElement, actionValue) {
    var slider = $(sliderElement);
    var instance = slider.data("plugin_zoro_slider");
    var currentTransition;

    if (!instance || !actionValue) {
      return;
    }

    if (
      typeof instance.getOption === "function" &&
      typeof instance.setOption === "function"
    ) {
      currentTransition = instance.getOption("transition");
      instance.setOption(
        "transition",
        getRandomShowcaseTransition(currentTransition),
      );
    }

    switch (actionValue) {
      case "next":
        instance.next();
        break;
      case "previous":
        instance.previous();
        break;
      case "goToFirst":
        instance.goToFirst();
        break;
      case "goToLast":
        instance.goToLast();
        break;
      case "goTo4":
        instance.goTo(4);
        break;
      case "startAutoplay":
        instance.startAutoplay();
        break;
      case "pauseAutoplay":
        instance.pauseAutoplay();
        break;
      case "resumeAutoplay":
        instance.resumeAutoplay();
        break;
      case "stopAutoplay":
        instance.stopAutoplay();
        break;
      case "restartAutoplay":
        instance.restartAutoplay();
        break;
      case "refreshLayout":
        instance.refreshLayout();
        break;
      default:
        break;
    }
  }

  function initApiButtons($) {
    var showcase = document.querySelector("[data-api-buttons]");

    if (!showcase) {
      return;
    }

    Array.prototype.forEach.call(
      showcase.querySelectorAll("[data-api-value]"),
      function (button) {
        if (button.getAttribute("data-api-bound") === "true") {
          return;
        }

        button.setAttribute("data-api-bound", "true");
        button.addEventListener("click", function (event) {
          var sliderElement = document.querySelector("[data-api-showcase]");
          var sliderInstance;

          event.preventDefault();

          if (!sliderElement) {
            return;
          }

          sliderInstance = $(sliderElement).data("plugin_zoro_slider");

          if (!sliderInstance) {
            return;
          }

          Array.prototype.forEach.call(
            showcase.querySelectorAll("[data-api-value]"),
            function (otherButton) {
              otherButton.classList.toggle("is-active", otherButton === button);
            },
          );
          executeApiShowcaseAction(
            $,
            sliderElement,
            button.getAttribute("data-api-value"),
          );
        });
      },
    );
  }

  function initDemoSlider($, paramsOverride) {
    var slider = document.querySelector(
      "[data-zoro-demo], [data-zoro-example]",
    );
    var config =
      getInlineConfig() || window.ZoroDemoConfig || window.ZoroExampleConfig;

    if (!slider || !config) {
      return;
    }

    var form = document.querySelector("[data-demo-controls]");
    var params = paramsOverride || new URLSearchParams(window.location.search);
    var configOptions = config.sliderOptions || config.options || {};
    var demoOptions = $.extend(true, {}, configOptions);

    setInlineConfig(config);
    syncSiteHeaderVisibility(config, params);

    if (form) {
      bindDemoControls(form, $, demoOptions);
    }

    applyLayoutControl(config, params, demoOptions);

    if (params.has("transition")) {
      demoOptions.transition = getParam(
        params,
        "transition",
        demoOptions.transition,
      );
    }

    if (params.has("dotsNav")) {
      demoOptions.dotsNav = parseBool(
        params.get("dotsNav"),
        demoOptions.dotsNav,
      );
    }

    if (params.has("thumbsNav")) {
      demoOptions.thumbsNav = parseBool(
        params.get("thumbsNav"),
        demoOptions.thumbsNav,
      );
    }

    if (params.has("dotsStyle")) {
      demoOptions.dotsStyle = getParam(
        params,
        "dotsStyle",
        demoOptions.dotsStyle,
      );
    }

    if (params.has("numbersNav")) {
      demoOptions.numbersNav = parseBool(
        params.get("numbersNav"),
        demoOptions.numbersNav,
      );
    }

    if (params.has("numbersStyle")) {
      demoOptions.numbersStyle = params.get("numbersStyle") || null;
    }

    if (params.has("dotsTooltipStyle")) {
      demoOptions.dotsTooltipStyle =
        params.get("dotsTooltipStyle") || demoOptions.dotsTooltipStyle;
    }

    if (params.has("numbersTooltipStyle")) {
      demoOptions.numbersTooltipStyle =
        params.get("numbersTooltipStyle") || demoOptions.numbersTooltipStyle;
    }

    if (params.has("controlStyle")) {
      demoOptions.controlStyle = getParam(
        params,
        "controlStyle",
        demoOptions.controlStyle,
      );
    }

    if (params.has("controlIcon")) {
      demoOptions.controlIcon = getParam(
        params,
        "controlIcon",
        demoOptions.controlIcon,
      );
    }

    if (params.has("progressMode")) {
      applyProgressMode(
        getParam(params, "progressMode", "both"),
        demoOptions,
        configOptions,
      );
    }

    if (demoOptions.carousel && demoOptions.carousel.active) {
      prepareCarouselSlides(slider);
    }

    $(slider).zoroSlider(demoOptions);
  }

  function initIndexLandingSlider($) {
    var slider = document.querySelector("[data-index-landing-slider]");

    if (!slider || $(slider).data("plugin_zoro_slider")) {
      return;
    }

    $(slider).zoroSlider({
      width: 560,
      height: 320,
      layout: "fullWidthScoped",
      responsive: true,
      transition: "fadeSlideHorizontal",
      transitionSpeed: 900,
      transitionDelay: 5200,
      autoPlay: true,
      pauseOnHover: true,
      controls: false,
      dotsNav: true,
      dotsStyle: "drawcircle",
      numbersNav: false,
      thumbsNav: false,
      progressBar: false,
      radialProgress: false,
      loader: true,
      loaderStyle: "line-scale",
    });
  }

  function initLandingCounters() {
    var counters = Array.prototype.slice.call(
      document.querySelectorAll("[data-landing-counter]"),
    );

    if (!counters.length) {
      return;
    }

    function animateCounter(counter) {
      var target = parseInt(counter.getAttribute("data-counter-value"), 10);
      var duration = parseInt(
        counter.getAttribute("data-counter-duration") || "1200",
        10,
      );
      var startTime = null;

      if (
        counter.getAttribute("data-counter-done") === "true" ||
        !Number.isFinite(target)
      ) {
        return;
      }

      counter.setAttribute("data-counter-done", "true");

      function tick(timestamp) {
        var progress;
        var value;

        if (!startTime) {
          startTime = timestamp;
        }

        progress = Math.min((timestamp - startTime) / duration, 1);
        value = Math.round(target * (1 - Math.pow(1 - progress, 3)));
        counter.textContent = String(value);

        if (progress < 1) {
          window.requestAnimationFrame(tick);
        } else {
          counter.textContent = String(target);
        }
      }

      window.requestAnimationFrame(tick);
    }

    if (!("IntersectionObserver" in window)) {
      counters.forEach(animateCounter);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.35,
      },
    );

    counters.forEach(function (counter) {
      observer.observe(counter);
    });
  }
  function initLightBox() {
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

  function initializeDemoContent($, paramsOverride) {
    var params = paramsOverride || new URLSearchParams(window.location.search);

    initAccordions();
    initFaqAccordions();
    initCodeCopyButtons();
    initLandingCounters();
    initLightBox();
    syncStickyHeaderHeight();
    highlightCodeBlocks();
    initDemoCategoryFilter();
    initApiButtons($);
    initControlsButtons($);
    initDotsButtons($);
    initTransitionButtons($);
    syncSiteHeaderVisibility(
      getInlineConfig() || window.ZoroDemoConfig || window.ZoroExampleConfig,
      params,
    );
    waitForPlugin(function (jq) {
      initDemoSlider(jq, params);
      initIndexLandingSlider(jq);
    }, 80);
  }

  window.addEventListener("load", function () {
    if (window.jQuery) {
      initQuicklinks(window.jQuery);
      initializeDemoContent(window.jQuery);
    }
  });

  window.addEventListener("resize", syncStickyHeaderHeight);
})();
