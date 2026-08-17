# Dataview Quick Reference

## Force refresh
Command palette → Dataview: Force Refresh

## Clear cache
Delete `.obsidian/plugins/dataview/data.json` then refresh

## Useful queries
```dataview
TABLE date, source, project FROM #ai SORT date DESC LIMIT 30
```

```dataview
LIST FROM #session WHERE source = "grok"
```

```dataview
TABLE length(rows) AS sessions FROM #ai GROUP BY project
```
