import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/** CI-only pixel fixture. It is explicitly synthetic and is not a Yandex Pro capture. */
public final class M4FixtureRenderer {
    public static void main(String[] args) throws Exception {
        if(args.length!=1) throw new IllegalArgumentException("expected PNG output path");
        BufferedImage image=new BufferedImage(720,1280,BufferedImage.TYPE_INT_RGB);
        Graphics2D g=image.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING,RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setColor(new Color(18,24,29));g.fillRect(0,0,image.getWidth(),image.getHeight());
        g.setColor(Color.WHITE);g.setFont(new Font("DejaVu Sans",Font.BOLD,42));g.drawString("Яндекс Про",44,118);
        g.setFont(new Font("DejaVu Sans",Font.BOLD,34));g.drawString("Слот: 900,00 ₽",44,205);
        g.setFont(new Font("DejaVu Sans",Font.PLAIN,28));g.drawString("339533360",44,247);
        g.setColor(new Color(255,125,80));g.setFont(new Font("DejaVu Sans",Font.BOLD,36));g.drawString("Заказы",44,329);
        g.setColor(Color.WHITE);g.setFont(new Font("DejaVu Sans",Font.BOLD,31));g.drawString("12:34",44,390);
        g.setFont(new Font("DejaVu Sans",Font.PLAIN,29));g.drawString("100,00 ₽",390,390);
        g.setColor(new Color(190,198,204));g.setFont(new Font("DejaVu Sans",Font.PLAIN,24));g.drawString("коэф 1.0",390,428);
        g.setColor(Color.WHITE);g.setFont(new Font("DejaVu Sans",Font.BOLD,32));g.drawString("Тип слота: Плановый",44,520);
        g.setFont(new Font("DejaVu Sans",Font.PLAIN,28));g.drawString("Начало",44,584);g.drawString("2026.10.13 17:59",230,584);
        g.drawString("Завершение",44,635);g.drawString("2026.10.13 22:04",260,635);
        g.setColor(new Color(180,190,198));g.setFont(new Font("DejaVu Sans",Font.PLAIN,25));
        g.drawString("СИНТЕТИЧЕСКИЙ ТЕСТ OCR",44,1190);
        g.dispose();
        if(!ImageIO.write(image,"png",new File(args[0]))) throw new IllegalStateException("PNG writer unavailable");
    }
}
