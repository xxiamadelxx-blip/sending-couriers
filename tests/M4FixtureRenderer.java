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
        g.setColor(Color.WHITE);g.setFont(new Font("DejaVu Sans",Font.BOLD,48));g.drawString("Яндекс Про",56,190);
        g.setColor(new Color(255,125,80));g.setFont(new Font("DejaVu Sans",Font.BOLD,58));g.drawString("Заказы сегодня",56,330);
        g.setColor(Color.WHITE);g.setFont(new Font("DejaVu Sans",Font.PLAIN,62));g.drawString("18",56,450);
        g.setColor(new Color(180,190,198));g.setFont(new Font("DejaVu Sans",Font.PLAIN,28));
        g.drawString("СИНТЕТИЧЕСКИЙ ТЕСТ OCR",56,1190);
        g.dispose();
        if(!ImageIO.write(image,"png",new File(args[0]))) throw new IllegalStateException("PNG writer unavailable");
    }
}
