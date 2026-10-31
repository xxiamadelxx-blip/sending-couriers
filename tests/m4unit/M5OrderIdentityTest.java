package ru.courier.finance;

import org.junit.Test;
import static org.junit.Assert.*;

public final class M5OrderIdentityTest {
    private static String hex(char ch) {
        StringBuilder value=new StringBuilder(64);
        for(int i=0;i<64;i++) value.append(ch);
        return value.toString();
    }
    @Test public void visibleEventIdentityIsIndependentOfVideoSource() {
        String first=M5OrderIdentity.rowId("2026-10-18","341234567",null,18*60+57,10000,1,hex('a'),0);
        String repeat=M5OrderIdentity.rowId("2026-10-18","341234567",null,18*60+57,10000,1,hex('b'),9);
        assertEquals(first,repeat);
    }

    @Test public void duplicateMinuteRowsRemainSeparateByOccurrence() {
        String first=M5OrderIdentity.rowId("2026-10-18","341234567",null,18*60+57,10000,1,hex('a'),0);
        String second=M5OrderIdentity.rowId("2026-10-18","341234567",null,18*60+57,10000,2,hex('a'),1);
        assertNotEquals(first,second);
    }

    @Test public void yandexOrderNumberIsTheStrongestIdentity() {
        String first=M5OrderIdentity.rowId("2026-10-18","341234567","261018-1234567",111,10000,1,hex('a'),0);
        String repeat=M5OrderIdentity.rowId("2026-10-18","341234567","261018-1234567",112,12000,1,hex('b'),5);
        assertEquals(first,repeat);
    }

    @Test public void missingEventFieldsUseSourceScopedFallback() {
        String first=M5OrderIdentity.rowId(null,null,null,-1,-1,0,hex('a'),2);
        String same=M5OrderIdentity.rowId(null,null,null,-1,-1,0,hex('a'),2);
        String other=M5OrderIdentity.rowId(null,null,null,-1,-1,0,hex('b'),2);
        assertEquals(first,same);
        assertNotEquals(first,other);
    }
}
