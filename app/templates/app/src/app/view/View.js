var Actions = require('app/resources/Actions');
var Msgbox = require('widget/Msgbox');
var WechatShare = require('util/WechatShare');
var YiXinShare = require('util/YiXinShare');

var BasicModel = require('app/model/Model');

function View() {
  this.models = {
    Basic: BasicModel
  }

  var VIEW = this,
    els, shareStore = {},
    params = Core.localParam(),
    isApp = Core.NativeBridge.isApp();
  //click事件
  this.tapEvent = $.os.ios || $.os.android ? 'tap' : 'click';

  function init() {
    Core.MetaHandler.fixViewportWidth();
    initEls();
    bindEvent();
    VIEW.hide();
    els.body.css({'visibility': 'visible'});
  };//end init

  function initEls() {
    var body = $('body');
    els = {
      window: $(window),
      body: body,
      views: body.children('.view')
    }
    VIEW.GlobalTouch = {
      preventMove: false,
      touched: false
    }
    window.GlobalTouch = VIEW.GlobalTouch;
    VIEW.msgbox = new Msgbox({
      // themeCls: 'deja',
      GlobalTouch: VIEW.GlobalTouch
    });
  }

  this.getEls = function () {
    return els;
  }
  this.getView = function (viewCls) {
    return els.views.filter('.' + viewCls);
  }
  //parse elements have "data-template" into templates
  this.getTemplates = function (viewCls) {
    var el = this.getView(viewCls);
    if (el.$Templates) {
      return el.$Templates;
    }
    var Templates = {};
    el.find('*[data-template]').each(function () {
      var key = $(this),
        name = key.attr('data-template');
      if (name) {
        Templates[name] = Core.microTmpl(key.text());
      }
    });
    el.$Templates = Templates;
    return Templates;
  }
  /**
   * find all elements have "data-element"
   * @param viewCls
   * @param extra object
   * e.g.:
   * //1.  pass an object
   * {
   *   defaultUserid: 'user_id_xxxx'
   * }
   *
   * //2. pass a function that return an obeject,"this" is the elements' own object
   * function(){
   *  return {
   *    userList: this.main.find('.list')
   *  }
   * }
   *
   * @returns {*}
   */
  this.getElements = function (viewCls,extra) {
    var el = this.getView(viewCls);
    if (el.$Elements) {
      return el.$Elements;
    }
    var Elements = {
      window: els.window,
      body: els.body,
      main: el,
      apply: function(conf){
        Core.Class.apply(Elements,conf);
      }
    };
    el.find('*[data-element]').each(function () {
      var name = $(this).attr('data-element');
      if (name) {
        Elements[name] = Elements[name] || el.find('*[data-element="'+name+'"]');
      }
    });
    Elements.apply(extra);
    el.$Elements = Elements;
    return Elements;
  }

  this.resizeCalculateWindow = function () {
    els.window = $(window);
    els.body = $('body');
    setTimeout(function () {
      els.bodyHeight = els.body.height();
      els.windowMaxScroll = els.bodyHeight - els.window.height() * 2;
    }, 300);
  }

  this.isMaxWindowScroll = function (budget) {
    var top = Math.min(Math.min(window.pageYOffset, document.documentElement.scrollTop || document.body.scrollTop), window.scrollY),
      maxScroll = budget ? (els.bodyHeight - budget) : els.windowMaxScroll;
    return top > maxScroll;
  }

  function bindEvent() {
    document.addEventListener('touchmove', function (e) {
      VIEW.GlobalTouch.preventMove && e.preventDefault();
    }, false);
    document.addEventListener('touchstart', function (e) {
      VIEW.GlobalTouch.touched = true;
    }, false);
    document.addEventListener('touchend', function (e) {
      VIEW.GlobalTouch.touched = false;
    }, false);
    //data-prevent-move="start" prevent document to move ontouchstart and cancel ontouchend,
    //data-prevent-move="all" will always prevent the whole document to move
    els.body.on('touchstart', '* [data-prevent-move]', function () {
      VIEW._BasicView.GlobalTouch.preventMove = true;
    });
    els.body.on('touchend', '* [data-prevent-move="start"]', function () {
      VIEW._BasicView.GlobalTouch.preventMove = false;
    });
    if (VIEW.tapEvent == 'tap') {
      els.body.on('click', 'a', function (e) {
        e.preventDefault();
        return false;
      });
      els.body.on('tap', 'a', function () {
        Core.Event.trigger('redirect', this.href);
      });
    }
    //fix chrome for android active effect remain issue
    $.os.android && /Chrome/i.test(window.navigator.userAgent) && els.body.on('touchstart', '* [data-fix-active]', function (e) {
      e.preventDefault();
    });
    els.body.on(VIEW.tapEvent, '* [data-fake-link]', function () {
      Core.Event.trigger('redirect', this.getAttribute('data-fake-link'));
    });
    els.body.on(VIEW.tapEvent == 'tap' ? 'touchstart' : VIEW.tapEvent, '* [data-analytics]', function () {
      Core.Event.trigger(this.getAttribute('data-analytics-global') ? 'analytics' : 'analyticsCurView', this.getAttribute('data-analytics'));
    });
    els.body.on(VIEW.tapEvent, '* [data-eventname]', function () {
      var ename = this.getAttribute('data-eventname'),
        eparam = this.getAttribute('data-eventparam') || '',
        eparams = this.getAttribute('data-eventparams') || '';

      if (ename) {
        var params = [];
        params.push(ename);
        if (eparams) {
          Array.prototype.push.apply(params, eparams.split(','));
        } else if (eparam) {
          params.push(eparam);
        }
        Core.Event.trigger.apply(null, params);
      }
    });
  }

  this.show = function (viewCls, autoRevert) {
    this.hide(viewCls);

    var view = this.getView(viewCls);
    !view.hasClass('show') && view.addClass('show');
    //auto scroll to history position,and restore title
    if (autoRevert === undefined || autoRevert) {
      Core.Event.trigger('appModifyTitle', Core.Router.getHistoryTitle());
      setTimeout(Core.Router.scrollToHistoryPosition, 100);
      restoreShare();
    }
    return this;
  }
  this.hide = function (notCls) {
    (notCls ? els.views.not('.' + notCls) : els.views).removeClass('show');
    return this;
  }

  /**
   *
   * option = {
             title String 'share title',
             text String 'share text',
             summary String 'share summary',
             imageurl String 'share image url',
             thumburl String 'share image thumb url',
             link String 'share link'
             }
   */
  this.renderShare = function (option) {
    option = option || {};
    option.link = option.link || window.location.href;
    option.title = option.title || document.title;
    option.summary = option.summary || option.title;
    option.text = option.text || option.summary;
    option.thumburl = option.thumburl || Actions.dejaShareLogo;
    option.imageurl = option.imageurl || option.thumburl;


    Core.NativeBridge.set_data_for_share(option);
    shareStore[Core.Router.getCurrentHashStr()] = option;

    updateWechatShareMeta(option.title, option.summary, option.thumburl || option.imageurl);
    updateYiXinShareMeta(option.summary, option.thumburl || option.imageurl);
    return this;
  }

  function updateWechatShareMeta(title, content, link, img) {
    WechatShare({
      "appid": "",
      "img_url": img || Actions.dejaShareLogo,
      "img_width": "200",
      "img_height": "200",
      "link": link || window.location.href,
      "url": link || window.location.href,
      "desc": content || document.title,
      "content": content || document.title,
      "title": title || document.title
    });
  }

  function updateYiXinShareMeta(content, img) {
    YiXinShare({
      content: content || document.title,
      img: img || Actions.dejaShareLogo
    });
  }

  function restoreShare() {
    if(shareStore[Core.Router.getCurrentHashStr()]){
      VIEW.renderShare(shareStore[Core.Router.getCurrentHashStr()]);
    }
  }

  this.lazyLoadImg = function (el) {
    el && setTimeout(function () {
      el.find("img").unveil(200, function () {
        this.onload = function () {
          if (/lazy/.test(this.className)) {
            this.classList.add('lazy--loaded');
            //this.style.opacity = 1;
          }
        }
      });
    }, 0);
  }

  this.renderI18n = function(el){
    el.find('*[data-i18n]').each(function () {
      var currEl = $(this),
        name = currEl.attr('data-i18n');

      if (name) {
        var attrs = name.split('.'),
          text = window[attrs.shift()];
        attrs.forEach(function (key) {
          if(key.length && text!==undefined){
            text = text[key];
          }
        });
        if(text!==undefined){
          currEl.html(text);
        }
      }
    });
  }

  init();
}//end View
module.exports = new View;
