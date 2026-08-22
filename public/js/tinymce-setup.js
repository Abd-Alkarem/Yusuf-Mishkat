window.mosawyTinymceSetup = function(editor) {
  // Complete KFGQPC Arabic Symbols mapping from the Ithraa template v3
  var symMap = {
    '\u0628\u0633\u06451': 0xF021,   // بسم الله الرحمن الرحيم (style 1)
    '\u0628\u0633\u06452': 0xF022,   // بسم الله الرحمن الرحيم (style 2)
    '\u0628\u0633\u06453': 0xF023,   // بسم الله الرحمن الرحيم (style 3)
    '\u0639\u0632': 0xF062,          // عز وجل
    '\u0633\u0628\u062D': 0xF063,    // سبحانه وتعالى
    '\u062C\u0644': 0xF065,          // جل وعلا
    '\u06351': 0xF067,               // صلى الله عليه وسلم (calligraphic)
    '\u06352': 0xFDFA,               // صلى الله عليه وسلم (Unicode ﷺ)
    '\u06391': 0xF06E,               // عليه السلام
    '\u063911': 0xF06F,              // عليها السلام
    '\u06392': 0xF071,               // عليهما السلام
    '\u06393': 0xF070,               // عليهم السلام
    '\u06311': 0xF068,               // رضي الله عنه
    '\u063111': 0xF069,              // رضي الله عنها
    '\u06312': 0xF06B,               // رضي الله عنهما
    '\u06313': 0xF06A,               // رضي الله عنهم
    '\u063133': 0xF06C,              // رضي الله عنهن
    '\u0631\u062D1': 0xF072,         // رحمه الله
    '\u0631\u062D11': 0xF075,        // رحمها الله
    '\u0631\u062D2': 0xF074,         // رحمهما الله
    '\u0631\u062D3': 0xF073          // رحمهم الله
  };

  function insertSym(ed, code) {
    ed.insertContent('<span class="islamic-sym">' + String.fromCharCode(code) + '</span>');
  }

  var textMap = {
    'واجهة الإسلامية': 'الجامعة الإسلامية بالمدينة المنورة',
    'واجهة الإمام': 'جامعة الإمام محمد بن سعود الإسلامية',
    'واجهة سعود': 'جامعة الملك سعود',
    'واجهة أم القرى': 'كلية الشريعة - جامعة أم القرى',
    'واجهة خالد': 'جامعة الملك خالد',
    'واجهة القصيم': 'جامعة القصيم',
    'واجهة الجوف': 'جامعة الجوف'
  };
  
  // F3 key: look backward for abbreviation and replace
  editor.on('keydown', function(e) {
    // Alt shortcuts
    if (e.altKey) {
      var handled = true;
      var key = e.key.toLowerCase();
      if (key === 'x') {
        editor.insertContent('(*)');
      } else if (key === 'z') {
        editor.insertContent('[*]');
      } else if (e.key === '0') {
        editor.insertContent('»');
      } else if (e.key === '9') {
        editor.insertContent('«');
      } else if (key === 'k') {
        editor.insertContent('<h3 style="text-align: right; margin: 10px 0;">عنوان جانبي</h3>');
      } else if (key === 'l') {
        editor.insertContent('<h3 style="text-align: left; margin: 10px 0;">عنوان جانبي</h3>');
      } else if (key === 'm') {
        editor.insertContent('<div style="text-align: center; margin: 20px 0; font-size: 1.5em;">❖</div>');
      } else if (key === 'q') {
        editor.insertContent('<table style="width: 100%; border: none;"><tr><td style="width: 45%; text-align: center; padding: 5px;">الشطر الأول</td><td style="width: 10%; text-align: center; padding: 5px;">...</td><td style="width: 45%; text-align: center; padding: 5px;">الشطر الثاني</td></tr></table><p></p>');
      } else if (key === 'w') {
        editor.insertContent('<table style="width: 100%; border: none;"><tr><td style="width: 50%; text-align: right; padding: 5px;">الشطر الأول</td><td style="width: 50%; text-align: left; padding: 5px;">الشطر الثاني</td></tr></table><p></p>');
      } else {
        handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    if (e.key === 'F3' || e.keyCode === 114) {
      e.preventDefault();
      e.stopPropagation();
      var rng = editor.selection.getRng();
      var node = rng.startContainer;
      if (node.nodeType === 3) {
        var text = node.textContent;
        var pos = rng.startOffset;
        var before = text.substring(0, pos);
        
        // Check text map first
        var textKeys = Object.keys(textMap).sort(function(a,b){ return b.length - a.length; });
        for (var i = 0; i < textKeys.length; i++) {
          if (before.endsWith(textKeys[i])) {
            var abbr = textKeys[i];
            rng.setStart(node, pos - abbr.length);
            rng.setEnd(node, pos);
            editor.selection.setRng(rng);
            editor.insertContent(textMap[abbr]);
            return;
          }
        }

        // Then check symbol map
        var keys = Object.keys(symMap).sort(function(a,b){ return b.length - a.length; });
        for (var i = 0; i < keys.length; i++) {
          if (before.endsWith(keys[i])) {
            var abbr = keys[i];
            // Delete the abbreviation text
            rng.setStart(node, pos - abbr.length);
            rng.setEnd(node, pos);
            editor.selection.setRng(rng);
            insertSym(editor, symMap[abbr]);
            return;
          }
        }
      }
    }
  });

  // Dropdown menu for clicking
  editor.ui.registry.addMenuButton('islamic', {
    text: '\u2640 اختصارات',
    fetch: function (callback) {
      var items = [
        { type: 'menuitem', text: 'بسم1 — بسم الله الرحمن الرحيم (1)', onAction: function () { insertSym(editor, symMap['\u0628\u0633\u06451']); } },
        { type: 'menuitem', text: 'بسم2 — بسم الله الرحمن الرحيم (2)', onAction: function () { insertSym(editor, symMap['\u0628\u0633\u06452']); } },
        { type: 'menuitem', text: 'بسم3 — بسم الله الرحمن الرحيم (3)', onAction: function () { insertSym(editor, symMap['\u0628\u0633\u06453']); } },
        { type: 'menuitem', text: 'ص1 — صلى الله عليه وسلم', onAction: function () { insertSym(editor, symMap['\u06351']); } },
        { type: 'menuitem', text: 'ص2 — \uFDFA', onAction: function () { insertSym(editor, symMap['\u06352']); } },
        { type: 'menuitem', text: 'عز — عز وجل', onAction: function () { insertSym(editor, symMap['\u0639\u0632']); } },
        { type: 'menuitem', text: 'سبح — سبحانه وتعالى', onAction: function () { insertSym(editor, symMap['\u0633\u0628\u062D']); } },
        { type: 'menuitem', text: 'جل — جل وعلا', onAction: function () { insertSym(editor, symMap['\u062C\u0644']); } },
        { type: 'menuitem', text: 'ع1 — عليه السلام', onAction: function () { insertSym(editor, symMap['\u06391']); } },
        { type: 'menuitem', text: 'ع11 — عليها السلام', onAction: function () { insertSym(editor, symMap['\u063911']); } },
        { type: 'menuitem', text: 'ع2 — عليهما السلام', onAction: function () { insertSym(editor, symMap['\u06392']); } },
        { type: 'menuitem', text: 'ع3 — عليهم السلام', onAction: function () { insertSym(editor, symMap['\u06393']); } },
        { type: 'menuitem', text: 'ر1 — رضي الله عنه', onAction: function () { insertSym(editor, symMap['\u06311']); } },
        { type: 'menuitem', text: 'ر11 — رضي الله عنها', onAction: function () { insertSym(editor, symMap['\u063111']); } },
        { type: 'menuitem', text: 'ر2 — رضي الله عنهما', onAction: function () { insertSym(editor, symMap['\u06312']); } },
        { type: 'menuitem', text: 'ر3 — رضي الله عنهم', onAction: function () { insertSym(editor, symMap['\u06313']); } },
        { type: 'menuitem', text: 'ر33 — رضي الله عنهن', onAction: function () { insertSym(editor, symMap['\u063133']); } },
        { type: 'menuitem', text: 'رح1 — رحمه الله', onAction: function () { insertSym(editor, symMap['\u0631\u062D1']); } },
        { type: 'menuitem', text: 'رح11 — رحمها الله', onAction: function () { insertSym(editor, symMap['\u0631\u062D11']); } },
        { type: 'menuitem', text: 'رح2 — رحمهما الله', onAction: function () { insertSym(editor, symMap['\u0631\u062D2']); } },
        { type: 'menuitem', text: 'رح3 — رحمهم الله', onAction: function () { insertSym(editor, symMap['\u0631\u062D3']); } },
        { type: 'separator' },
        { type: 'menuitem', text: 'Alt+X — (*)', onAction: function () { editor.insertContent('(*)'); } },
        { type: 'menuitem', text: 'Alt+Z — [*]', onAction: function () { editor.insertContent('[*]'); } },
        { type: 'menuitem', text: 'Alt+0 — »', onAction: function () { editor.insertContent('\u00BB'); } },
        { type: 'menuitem', text: 'Alt+9 — «', onAction: function () { editor.insertContent('\u00AB'); } },
        { type: 'menuitem', text: 'Alt+K — عنوان جانبي (يمين)', onAction: function () { editor.insertContent('<h3 style="text-align: right; margin: 10px 0;">عنوان جانبي</h3>'); } },
        { type: 'menuitem', text: 'Alt+L — عنوان جانبي (يسار)', onAction: function () { editor.insertContent('<h3 style="text-align: left; margin: 10px 0;">عنوان جانبي</h3>'); } },
        { type: 'menuitem', text: 'Alt+M — فاصل ❖', onAction: function () { editor.insertContent('<div style="text-align: center; margin: 20px 0; font-size: 1.5em;">❖</div>'); } },
        { type: 'menuitem', text: 'Alt+Q — شعر مستوي', onAction: function () { editor.insertContent('<table style="width: 100%; border: none;"><tr><td style="width: 45%; text-align: center; padding: 5px;">الشطر الأول</td><td style="width: 10%; text-align: center; padding: 5px;">...</td><td style="width: 45%; text-align: center; padding: 5px;">الشطر الثاني</td></tr></table><p></p>'); } },
        { type: 'menuitem', text: 'Alt+W — شعر شطرين', onAction: function () { editor.insertContent('<table style="width: 100%; border: none;"><tr><td style="width: 50%; text-align: right; padding: 5px;">الشطر الأول</td><td style="width: 50%; text-align: left; padding: 5px;">الشطر الثاني</td></tr></table><p></p>'); } }
      ];
      callback(items);
    }
  });

  editor.on('init', function() {
    var promo = editor.getContainer().querySelector('.tox-promotion');
    if(promo) promo.style.display = 'none';
    var notice = editor.getContainer().querySelector('.tox-notification');
    if(notice) notice.style.display = 'none';
  });
};
