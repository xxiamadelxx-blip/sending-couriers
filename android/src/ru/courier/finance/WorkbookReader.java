package ru.courier.finance;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.json.JSONArray;
import org.json.JSONObject;

/** Bounded, offline XLSX reader. No formulas/macros/links are executed. */
public final class WorkbookReader {
    private static final int LIMIT = 24_000_000;
    private static Document xml(byte[] bytes) throws Exception {
        if (bytes == null) throw new IllegalArgumentException("Missing workbook part");
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setExpandEntityReferences(false);
        // Android providers differ in supported hardening flags; reject DTDs before parsing too.
        String prefix = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
        if (prefix.contains("<!DOCTYPE") || prefix.contains("<!ENTITY") || prefix.indexOf('\0') >= 0) throw new IllegalArgumentException("DTD forbidden");
        try { factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true); } catch (Exception ignored) { }
        try { factory.setFeature("http://xml.org/sax/features/external-general-entities", false); } catch (Exception ignored) { }
        try { factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false); } catch (Exception ignored) { }
        return factory.newDocumentBuilder().parse(new ByteArrayInputStream(bytes));
    }
    public static String read(InputStream input) throws Exception {
        Map<String, byte[]> parts = new HashMap<>();
        int total = 0, count = 0;
        try (ZipInputStream zip = new ZipInputStream(input)) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zip.getNextEntry()) != null) {
                if (++count > 1000) throw new IllegalArgumentException("Too many XLSX parts");
                String name = entry.getName();
                if (name.contains("..") || name.startsWith("/")) throw new IllegalArgumentException("Invalid XLSX path");
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                int n;
                while ((n = zip.read(buffer)) != -1) { total += n; if (total > LIMIT) throw new IllegalArgumentException("XLSX too large"); out.write(buffer, 0, n); }
                if (name.endsWith(".xml") || name.endsWith(".rels")) parts.put(name, out.toByteArray());
            }
        }
        JSONArray shared = new JSONArray();
        if (parts.containsKey("xl/sharedStrings.xml")) {
            NodeList list = xml(parts.get("xl/sharedStrings.xml")).getElementsByTagNameNS("*", "si");
            for (int i=0; i<list.getLength(); i++) shared.put(list.item(i).getTextContent());
        }
        Map<String,String> relations = new HashMap<>();
        NodeList rels = xml(parts.get("xl/_rels/workbook.xml.rels")).getElementsByTagNameNS("*", "Relationship");
        for (int i=0; i<rels.getLength(); i++) {
            Element rel = (Element)rels.item(i);
            if ("External".equals(rel.getAttribute("TargetMode"))) continue;
            String target = rel.getAttribute("Target");
            if (target.contains("..")) throw new IllegalArgumentException("Invalid relation");
            relations.put(rel.getAttribute("Id"), target.startsWith("/")?target.substring(1):"xl/"+target);
        }
        JSONObject sheets = new JSONObject();
        NodeList list = xml(parts.get("xl/workbook.xml")).getElementsByTagNameNS("*", "sheet");
        for (int i=0; i<list.getLength(); i++) {
            Element sheet = (Element)list.item(i);
            String name = sheet.getAttribute("name");
            if (!java.util.Arrays.asList("Смены", "Дневные итоги", "Заказы RAW", "Прогнозы", "Точность", "Модели", "Настройки", "Финансовые правила").contains(name)) continue;
            String id = sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
            Document document = xml(parts.get(relations.get(id)));
            NodeList cells = document.getElementsByTagNameNS("*", "c");
            if (cells.getLength() > 100000) throw new IllegalArgumentException("Too many XLSX cells");
            JSONObject rows = new JSONObject();
            for (int j=0; j<cells.getLength(); j++) {
                Element cell = (Element)cells.item(j);
                String address = cell.getAttribute("r");
                if (!address.matches("[A-Z]{1,3}[1-9][0-9]{0,5}")) continue;
                String row = address.replaceAll("[A-Z]", ""), column = address.replaceAll("[0-9]", "");
                if (!rows.has(row)) rows.put(row, new JSONObject());
                if (cell.getElementsByTagNameNS("*", "f").getLength() > 0) { rows.getJSONObject(row).put(column, new JSONObject().put("formula", true)); continue; }
                String type = cell.getAttribute("t");
                NodeList values = cell.getElementsByTagNameNS("*", "v");
                Object value = JSONObject.NULL;
                if ("inlineStr".equals(type)) { NodeList text = cell.getElementsByTagNameNS("*", "is"); if (text.getLength()>0) value=text.item(0).getTextContent(); }
                else if (values.getLength()>0) {
                    String text = values.item(0).getTextContent();
                    if ("s".equals(type)) value=shared.get(Integer.parseInt(text));
                    else if (type.isEmpty() || "n".equals(type)) { try { value=Double.parseDouble(text); } catch (NumberFormatException ignored) { } }
                    else if (!"e".equals(type)) value=text;
                }
                rows.getJSONObject(row).put(column, value);
            }
            sheets.put(name, rows);
        }
        return new JSONObject().put("sheets", sheets).toString();
    }
}
