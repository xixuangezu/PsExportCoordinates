#target photoshop
app.bringToFront();
if (!app.documents.length) { alert("请先打开一个文档"); throw new Error("取消"); }
var doc = app.activeDocument;
var docName = decodeURI(doc.name).replace(/\.[^\.]+$/, '');
var defaultFolder = doc.saved ? doc.path.fsName : Folder.myDocuments.fsName;
var docWidth = doc.width.as("px");
var docHeight = doc.height.as("px");

// 1. 弹窗
var dlg = new Window("dialog", "导出图层 PNG & 坐标");
dlg.alignChildren = "fill";
dlg.pnl1 = dlg.add("panel", undefined, "选项");
dlg.pnl1.orientation = "column";
dlg.chkHidden = dlg.pnl1.add("checkbox", undefined, "导出隐藏图层");
dlg.chkHidden.value = false;
dlg.chkCover = dlg.pnl1.add("checkbox", undefined, "同名 PNG 覆盖 (不勾自动 +01)");
dlg.chkCover.value = false;
dlg.chkPreserve = dlg.pnl1.add("checkbox", undefined, "保留画面外的部分");
dlg.chkPreserve.value = false;
dlg.chkOnlyTxt = dlg.pnl1.add("checkbox", undefined, "只导出 TXT 不导出 PNG");
dlg.chkOnlyTxt.value = false;
dlg.grp = dlg.pnl1.add("group");
dlg.grp.add("statictext", undefined, "输出目录：");
var edt = dlg.grp.add("edittext", undefined, defaultFolder);
edt.characters = 30;
var btnBrowse = dlg.grp.add("button", undefined, "…");
btnBrowse.onClick = function() {
  var f = Folder.selectDialog("选择输出目录", edt.text);
  if (f) edt.text = f.fsName;
}
dlg.btns = dlg.add("group");
dlg.btns.alignment = "center";
dlg.btns.add("button", undefined, "确定", {name:"ok"});
dlg.btns.add("button", undefined, "取消", {name:"cancel"});
if (dlg.show() != 1) throw new Error("取消");

var exportHidden = dlg.chkHidden.value;
var coverSame    = dlg.chkCover.value;
var preserveOutside = dlg.chkPreserve.value;
var onlyTxt          = dlg.chkOnlyTxt.value;
var outBase      = edt.text;

// 2. 收集所有图层
function collectLayers(parent, arr) {
  for (var i=0; i<parent.layers.length; i++) {
    var L = parent.layers[i];
    if (L.typename=="LayerSet") collectLayers(L, arr);
    else arr.push(L);
  }
}
var layers = [];
collectLayers(doc, layers);
if (layers.length == 0) { alert("没有图层可导出"); throw new Error("取消"); }

// 3. 建文件夹 & TXT
var outFolder = new Folder(outBase + "/" + docName + "_txt");
if (!outFolder.exists) outFolder.create();
var txtFile = new File(outFolder.fsName + "/" + docName + ".txt");
txtFile.encoding = "UTF8";
txtFile.open("w");
txtFile.writeln("文件名\tX,Y\t宽×高\t透明度");

function showAllParents(layer) {
  var p = layer.parent;
  while (p && p.typename !== "Document") {
    p.visible = true;
    p = p.parent;
  }
}

// 4. 导出循环
var nameCount = {};
for (var i=0; i<layers.length; i++) {
  var L = layers[i];
  if (!exportHidden && !L.visible) continue;

  // 4.1 计算原始 bounds（可能为负或超出画布）
  var b = L.bounds;
  var bx0 = b[0].as("px"), by0 = b[1].as("px"), bx1 = b[2].as("px"), by1 = b[3].as("px");
  // 全部尺寸&坐标
  var wFull = bx1 - bx0, hFull = by1 - by0;
  var xFull = bx0,        yFull = docHeight - by1;
  // 裁剪到画布内的尺寸&坐标
  var left2   = Math.max(bx0, 0),
      top2    = Math.max(by0, 0),
      right2  = Math.min(bx1, docWidth),
      bottom2 = Math.min(by1, docHeight);
  var wTrim = right2 - left2, hTrim = bottom2 - top2;
  var xTrim = left2,          yTrim = docHeight - bottom2;

  // 4.2 根据“保留画面外的部分”决定导出时记录哪组坐标与尺寸
  var x = preserveOutside ? xFull : xTrim;
  var y = preserveOutside ? yFull : yTrim;
  var w = preserveOutside ? wFull : wTrim;
  var h = preserveOutside ? hFull : hTrim;
  var opacity = L.opacity; 

  // 4.3 记录 TXT
  txtFile.writeln(L.name + "\t" + x + "," + y + "\t" + w + "×" + h + "\t" + opacity + "%");

  if (onlyTxt) continue;

  // 4.4 PNG 文件名
  var base = L.name.replace(/[\/\\\:\*\?\"<>\|]/g, "_");
  if (!nameCount[base]) nameCount[base] = 0;
  nameCount[base]++;
  var fname = base + (coverSame ? "" : (nameCount[base]>1 ? ("_" + ("00"+nameCount[base]).substr(-2)) : "")) + ".png";
  var outFile = new File(outFolder.fsName + "/" + fname);

  // 4.5 复制到新文档并只显示当前图层
  var dup = doc.duplicate();
  function findLayerByName(parent, name) {
    for (var j=0; j<parent.layers.length; j++) {
      var lyr = parent.layers[j];
      if (lyr.name === name) return lyr;
      if (lyr.typename === "LayerSet") {
        var r = findLayerByName(lyr, name);
        if (r) return r;
      }
    }
    return null;
  }
  var target = findLayerByName(dup, L.name);
  if (target) dup.activeLayer = target;
  function hideAll(p) {
    for (var j=0; j<p.layers.length; j++) {
      var q = p.layers[j];
      q.visible = false;
      if (q.typename=="LayerSet") hideAll(q);
    }
  }
  hideAll(dup);
  showAllParents(dup.activeLayer);
  dup.activeLayer.visible = true;

  if (preserveOutside) {
    var dupW = dup.width.as("px"), dupH = dup.height.as("px");
    var extraLeft   = Math.max(-bx0, 0),
        extraTop    = Math.max(-by0, 0),
        extraRight  = Math.max(bx1 - docWidth, 0),
        extraBottom = Math.max(by1 - docHeight, 0);
    if (extraLeft > 0) {
      dup.resizeCanvas(UnitValue(dupW + extraLeft, "px"), dup.height, AnchorPosition.MIDDLERIGHT);
    }
    if (extraRight > 0) {
      dup.resizeCanvas(UnitValue(dup.width.as("px") + extraRight, "px"), dup.height, AnchorPosition.MIDDLELEFT);
    }
    if (extraTop > 0) {
      dup.resizeCanvas(dup.width, UnitValue(dupH + extraTop, "px"), AnchorPosition.BOTTOMCENTER);
    }
    if (extraBottom > 0) {
      dup.resizeCanvas(dup.width, UnitValue(dup.height.as("px") + extraBottom, "px"), AnchorPosition.TOPCENTER);
    }
  }

  // 4.6 裁剪透明边框
  dup.trim(TrimType.TRANSPARENT, true, true, true, true);

  // 4.7 导出 PNG
  var opts = new ExportOptionsSaveForWeb();
  opts.format = SaveDocumentType.PNG;
  opts.PNG8 = false;
  opts.transparency = true;
  dup.exportDocument(outFile, ExportType.SAVEFORWEB, opts);
  dup.close(SaveOptions.DONOTSAVECHANGES);
}

txtFile.close();
alert("导出完成，保存在：" + outFolder.fsName);
