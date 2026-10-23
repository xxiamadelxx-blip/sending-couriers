package ru.courier.finance;
import java.io.FileInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
public final class WorkbookProbe {
    public static void main(String[] args) throws Exception {
        try (FileInputStream in = new FileInputStream(args[0])) {
            Files.writeString(Path.of(args[1]), WorkbookReader.read(in));
        }
        System.out.println("PASS: production WorkbookReader executed on supplied XLSX");
    }
}
