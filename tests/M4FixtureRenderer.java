import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import javax.imageio.ImageIO;

/** CI-only pixel fixture. It is explicitly synthetic and is not a Yandex Pro capture. */
public final class M4FixtureRenderer {
    private static final int ORDER_COUNT=33;
    private static final int ROW_TOP=380;
    private static final int ROW_SPACING=34;
    private static final DateTimeFormatter FIXTURE_DATE=DateTimeFormatter.ofPattern("uuuu.MM.dd",Locale.ROOT);

    public static void main(String[] args) throws Exception {
        if(args.length!=3) throw new IllegalArgumentException("expected PNG output path, fixture date, and slot ID");
        LocalDate date=LocalDate.parse(args[1],FIXTURE_DATE);
        String slotId=args[2];
        if(!slotId.matches("[0-9]{9}")) throw new IllegalArgumentException("fixture slot ID must be nine digits");
        BufferedImage image=new BufferedImage(720,1608,BufferedImage.TYPE_INT_RGB);
        Graphics2D g=image.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING,RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setColor(new Color(18,24,29));g.fillRect(0,0,image.getWidth(),image.getHeight());
        g.setColor(Color.WHITE);g.setFont(new Font("DejaVu Sans",Font.BOLD,42));g.drawString("Яндекс Про",44,118);
        g.setFont(new Font("DejaVu Sans",Font.BOLD,34));g.drawString("Слот: 3300,00 ₽",44,205);
        g.setFont(new Font("DejaVu Sans",Font.PLAIN,28));g.drawString(slotId,44,247);
        g.setFont(new Font("DejaVu Sans",Font.PLAIN,26));g.drawString("33 заказа · 0 км",44,286);
        g.setColor(new Color(255,125,80));g.setFont(new Font("DejaVu Sans",Font.BOLD,36));g.drawString("Заказы",44,329);
        g.setColor(Color.WHITE);g.setFont(new Font("DejaVu Sans",Font.BOLD,27));
        for(int i=0;i<ORDER_COUNT;i++) {
            int minute=i<19?i+1:i==19?19:i;
            String time=String.format(Locale.ROOT,"12:%02d",minute);
            int y=ROW_TOP+i*ROW_SPACING;
            g.drawString(time,44,y);
            g.setFont(new Font("DejaVu Sans",Font.PLAIN,27));g.drawString("100,00 ₽",460,y);
            g.setFont(new Font("DejaVu Sans",Font.BOLD,27));
        }
        g.setColor(Color.WHITE);g.setFont(new Font("DejaVu Sans",Font.PLAIN,26));
        g.drawString("Тип слота: Плановый",44,1506);
        g.drawString("Начало "+date.format(FIXTURE_DATE)+" 12:00",44,1540);
        g.drawString("Завершение "+date.format(FIXTURE_DATE)+" 13:00",44,1574);
        g.dispose();
        if(!ImageIO.write(image,"png",new File(args[0]))) throw new IllegalStateException("PNG writer unavailable");
    }
}
