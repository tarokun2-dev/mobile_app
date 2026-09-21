import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { layoutChart, type ChartData } from '../domain/chart';
import { colors, spacing } from '../theme';

const HEIGHT = 220;
/** 累計の折れ線の色（右軸の目盛りも同じ色にして対応を分かりやすくする） */
const LINE_COLOR = '#F57C00';
const LINE_LABEL_COLOR = '#E65100';
const GRID_COLOR = '#E2E5E9';

interface Props {
  data: ChartData;
  /** 棒グラフの凡例（例: 「月ごとの収支」） */
  barLegend: string;
}

/**
 * 収支の棒グラフ（左軸）と、期間の始めからの累計の折れ線（右軸）。
 * 座標はすべて domain/chart の layoutChart が計算し、ここでは描くだけ。
 */
export function ProfitChart({ data, barLegend }: Props) {
  const [width, setWidth] = useState(0);
  const layout = useMemo(() => (width > 0 ? layoutChart(data, width, HEIGHT) : null), [data, width]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.floor(e.nativeEvent.layout.width));

  return (
    <View onLayout={onLayout}>
      {layout ? (
        <Svg width={layout.width} height={layout.height} accessibilityLabel="収支のグラフ">
          {layout.grid.map((g, i) => (
            <Line
              key={`grid-${i}`}
              x1={layout.plot.left}
              x2={layout.plot.right}
              y1={g.y}
              y2={g.y}
              stroke={g.isZero ? colors.subtext : GRID_COLOR}
              strokeWidth={g.isZero ? 1.2 : 1}
            />
          ))}
          {layout.grid.map((g, i) => (
            <SvgText
              key={`bl-${i}`}
              x={layout.plot.left - 4}
              y={g.y + 3.5}
              fontSize={10}
              fill={colors.subtext}
              textAnchor="end"
            >
              {g.barLabel}
            </SvgText>
          ))}
          {layout.grid.map((g, i) => (
            <SvgText
              key={`ll-${i}`}
              x={layout.plot.right + 4}
              y={g.y + 3.5}
              fontSize={10}
              fill={LINE_LABEL_COLOR}
              textAnchor="start"
            >
              {g.lineLabel}
            </SvgText>
          ))}
          {layout.bars.map((b, i) => (
            <Rect
              key={`bar-${i}`}
              x={b.x}
              y={b.y}
              width={b.width}
              height={b.height}
              fill={b.positive ? colors.plus : colors.minus}
            />
          ))}
          {layout.line.length > 1 ? (
            <Polyline
              points={layout.line.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={LINE_COLOR}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : layout.line.length === 1 ? (
            <Circle cx={layout.line[0].x} cy={layout.line[0].y} r={3} fill={LINE_COLOR} />
          ) : null}
          {layout.xLabels.map((l, i) => (
            <SvgText
              key={`x-${i}`}
              x={l.x}
              y={layout.plot.bottom + 15}
              fontSize={10}
              fill={colors.subtext}
              textAnchor="middle"
            >
              {l.text}
            </SvgText>
          ))}
        </Svg>
      ) : (
        <View style={{ height: HEIGHT }} />
      )}

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: colors.plus }]} />
          <View style={[styles.swatch, { backgroundColor: colors.minus }]} />
          <Text style={styles.legendText}>{barLegend}（左軸）</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.lineSwatch} />
          <Text style={styles.legendText}>累計（右軸）</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 12, color: colors.subtext },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  lineSwatch: { width: 18, height: 3, borderRadius: 2, backgroundColor: LINE_COLOR },
});
