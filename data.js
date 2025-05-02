const dashboardState = {
    selectedTime: null,
    chosenCategory: null,
    highlightedRows: [],
    setTimeRange(newRange) {
        this.selectedTime = newRange;
        this.refreshAll();
    },
    setCategory(cat) {
        this.chosenCategory = cat;
        this.refreshAll();
    },
    setHighlightedRows(rows) {
        this.highlightedRows = rows;
        this.refreshAll();
    },
    refreshAll() {
        renderAreaChart(this);
        renderBarChart(this);
        renderTable(this);
    }
};

let allData = [];

d3.csv("chocolate-sales.csv").then((dataset) => {
    allData = dataset;
    dataset.forEach((row) => {
        row.Date = d3.timeParse("%d-%b-%y")(row.Date);
        row.Amount = +row.Amount.replace(/[$,]/g, "");
        row["Boxes Shipped"] = +row["Boxes Shipped"];
    });

    buildTable(dataset);
    buildAreaChart(dataset);
    buildBarChart(dataset);

    d3.select("#reset-button").on("click", () => {
        dashboardState.setTimeRange(null);
        dashboardState.setCategory(null);
        dashboardState.setHighlightedRows([]);
    });
});

function buildTable(data) {
    const tableContainer = d3.select("#data-table");
    const table = tableContainer.append("table").attr("class", "datatable");
    const head = table.append("thead");
    const body = table.append("tbody");

    const fields = ["Sales Person", "Country", "Product", "Date", "Amount", "Boxes Shipped"];

    const headerRow = head.append("tr");
    fields.forEach(field => {
        const th = headerRow.append("th")
            .html(`${field} <span class="sort-arrow"></span>`)
            .on("click", function() {

                let asc = !d3.select(this).classed("asc");
                d3.selectAll("th").classed("asc", false).classed("desc", false).select(".sort-arrow").text("");
                d3.select(this).classed(asc ? "asc" : "desc", true)
                    .select(".sort-arrow")
                    .text(asc ? "▲" : "▼");
                let sorted = data.slice().sort((a, b) => {
                    if (asc) return d3.ascending(a[field], b[field]);
                    else return d3.descending(a[field], b[field]);
                });
                showRows(sorted.slice(currentPg * perPg, (currentPg + 1) * perPg));
            });
    });

    const filterRow = head.append("tr");
    fields.forEach(field => {
        const th = filterRow.append("th");
        if (["Date", "Amount", "Boxes Shipped"].includes(field)) {
            th.append("input")
                .attr("type", "text")
                .attr("placeholder", `Search ${field}`)
                .style("width", "100%")
                .on("input", function() {
                    const val = this.value.toLowerCase();
                    let filtered = data.filter(d => d[field].toString().toLowerCase().includes(val));
                    showRows(filtered.slice(currentPg * perPg, (currentPg + 1) * perPg));
                    paginate(filtered);
                });
        } else {
            let options = Array.from(new Set(data.map(d => d[field])));
            options.unshift("All");
            const select = th.append("select")
                .attr("class", "filter-dropdown")
                .style("width", "100%")
                .on("change", function() {
                    let chosen = this.value;
                    let filtered = chosen === "All" ? data : data.filter(d => d[field] === chosen);
                    showRows(filtered.slice(currentPg * perPg, (currentPg + 1) * perPg));
                    paginate(filtered);
                });
            select.selectAll("option")
                .data(options)
                .enter()
                .append("option")
                .text(d => d);
        }
    });

    const perPg = 10;
    let currentPg = 0;
    let colWidths = [];

    function showRows(rowsData) {
        const trs = body.selectAll("tr").data(rowsData, d => d.Product);
        trs.exit().remove();

        if (colWidths.length === 0) {
            colWidths = table.selectAll("th").nodes().map(th => th.getBoundingClientRect().width);
        }

        const newTrs = trs.enter()
            .append("tr")
            .on("click", (event, d) => {
                dashboardState.setHighlightedRows([d]);
            });

        newTrs.merge(trs)
            .classed("selected", d => dashboardState.highlightedRows.includes(d))
            .selectAll("td")
            .data(row => fields.map(col =>
                col === "Date" ? d3.timeFormat("%Y. %m. %d")(row[col]) : row[col]
            ))
            .join("td")
            .style("width", (d, i) => `${colWidths[i]}px`)
            .text(d => d);
    }

    function paginate(filtered = data) {
        const totalPgs = Math.ceil(filtered.length / perPg);
        d3.select("#pagination-controls").remove();

        const pagDiv = tableContainer.append("div")
            .attr("id", "pagination-controls")
            .style("margin-top", "10px");

        pagDiv.append("div")
            .attr("class", "pagination-info")
            .text(() => {
                const start = currentPg * perPg + 1;
                const end = Math.min((currentPg + 1) * perPg, filtered.length);
                return `Showing ${start} to ${end} of ${filtered.length} entries`;
            });

        const btnWrap = pagDiv.append("div")
            .attr("class", "pagination-wrapper")
            .style("display", "flex")
            .style("justify-content", "center");

        for (let p = 1; p <= totalPgs; ++p) {
            btnWrap.append("button")
                .attr("class", "page-btn")
                .text(p)
                .style("margin", "0 5px")
                .on("click", () => {
                    currentPg = p - 1;
                    showRows(filtered.slice(currentPg * perPg, (currentPg + 1) * perPg));
                    paginate(filtered);
                });
        }
    }

    showRows(data.slice(0, perPg));
    paginate();
}
function buildAreaChart(data) {
    const margin = { top: 20, right: 15, bottom: 60, left: 45 };
    const contextMargin = { top: 20, right: 15, bottom: 20, left: 45 };
    const parent = d3.select("#area-chart");
    const parentW = parent.node().clientWidth;
    const parentH = 400;
    const w = parentW - margin.left - margin.right;
    const h = parentH * 0.7 - margin.top - margin.bottom;
    const ctxH = parentH * 0.3 - contextMargin.top - contextMargin.bottom;
    let byDate = {};
    data.forEach(d => {
        let key = +d.Date;
        byDate[key] = (byDate[key] || 0) + d.Amount;
    });
    let allDays = d3.timeDay.range(
        d3.min(data, d => d.Date),
        d3.max(data, d => d.Date)
    );
    let filled = allDays.map(date => ({
        Date: date,
        Total: byDate[+date] || 0
    }));

    const x = d3.scaleTime().domain(d3.extent(filled, d => d.Date)).range([0, w]);
    const y = d3.scaleLinear().domain([0, d3.max(filled, d => d.Total)]).nice().range([h, 0]);
    const ctxX = x.copy();
    const ctxY = d3.scaleLinear().domain(y.domain()).range([ctxH, 0]);

    const area = d3.area().x(d => x(d.Date)).y0(h).y1(d => y(d.Total));
    const ctxArea = d3.area().x(d => ctxX(d.Date)).y0(ctxH).y1(d => ctxY(d.Total));

    const totalH = h + ctxH + margin.top + contextMargin.bottom + 30;
    const svg = parent.append("svg")
        .attr("viewBox", `0 0 ${w + margin.left + margin.right} ${totalH}`);

    const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

    g.append("path").datum(filled).attr("fill", "#8ecae6")
        .attr("d", area.y1(h))
        .transition().duration(900)
        .attr("d", area.y1(d => y(d.Total)));

    g.append("g").attr("class", "x-axis")
        .attr("transform", `translate(0,${h})`)
        .call(d3.axisBottom(x).tickSizeOuter(0));

    g.append("g").attr("class", "y-axis")
        .call(d3.axisLeft(y).ticks(6, "s"));

    const ctxG = svg.append("g").attr("transform", `translate(${contextMargin.left}, ${margin.top + h + 30})`);

    ctxG.append("path").datum(filled).attr("fill", "#219ebc").attr("d", ctxArea);

    ctxG.append("g").attr("class", "x-axis").attr("transform", `translate(0,${ctxH})`)
        .call(d3.axisBottom(ctxX).ticks(w < 500 ? 4 : 8));
    const brush = d3.brushX().extent([[0, 0], [w, ctxH]]).on("end", function({ selection }) {
        if (!selection) return;
        const [a, b] = selection.map(ctxX.invert);
        dashboardState.setTimeRange([a, b]);
        zoom([a, b]);
    });
    ctxG.append("g").attr("class", "brush").call(brush);

    function zoom(newDomain) {
        x.domain(newDomain);
        g.select("path").transition().duration(600).attr("d", area);
        g.select(".x-axis").transition().duration(600).call(d3.axisBottom(x).tickSizeOuter(0));
    }

    buildAreaChart.zoom = zoom;
}

function buildBarChart(data) {
    const margin = { top: 40, right: 30, bottom: 70, left: 60 };
    const parent = d3.select("#bar-chart");
    const w = parent.node().clientWidth - margin.left - margin.right;
    const h = 300;

    const svg = parent.append("svg")
        .attr("width", w + margin.left + margin.right)
        .attr("height", h + margin.top + margin.bottom);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const prods = Array.from(new Set(data.map(d => d.Product)));
    const prodData = prods.map(prod => ({
        prod,
        total: data.filter(d => d.Product === prod).reduce((sum, d) => sum + d.Amount, 0)
    }));

    const x = d3.scaleBand().domain(prods).range([0, w]).padding(0.2);
    const y = d3.scaleLinear().domain([0, d3.max(prodData, d => d.total)]).range([h, 0]);
    const color = d3.scaleOrdinal().domain(prods).range(d3.schemeSet2);

    g.selectAll(".bar")
        .data(prodData)
        .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.prod))
        .attr("width", x.bandwidth())
        .attr("y", d => y(d.total))
        .attr("height", d => h - y(d.total))
        .attr("fill", d => color(d.prod))
        .style("opacity", d => dashboardState.chosenCategory && dashboardState.chosenCategory !== d.prod ? 0.5 : 1)
        .on("click", (event, d) => {
            dashboardState.setCategory(d.prod);
        })
        .on("mouseover", function(event, d) {
            d3.select(this).transition().duration(250).attr("fill", d3.color(color(d.prod)).darker(0.7));
        })
        .on("mouseout", function(event, d) {
            d3.select(this).transition().duration(250).attr("fill", color(d.prod));
        });

    g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${h})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "rotate(-40)")
        .style("text-anchor", "end")
        .style("font-size", "12px");

    g.append("g").attr("class", "y-axis").call(d3.axisLeft(y).ticks(6)).selectAll("text").style("font-size", "12px");

    svg.append("text")
        .attr("x", margin.left + w / 2)
        .attr("y", margin.top / 2)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .text("Sales by Product");
}

function renderAreaChart(state) {
    const filtered = allData.filter(d => !state.chosenCategory || d.Product === state.chosenCategory);
    d3.select("#area-chart svg").remove();
    buildAreaChart(filtered);
    if (state.selectedTime) buildAreaChart.zoom(state.selectedTime);
}

function renderBarChart(state) {
    const filtered = allData.filter(d =>
        !state.selectedTime || (d.Date >= state.selectedTime[0] && d.Date <= state.selectedTime[1])
    );
    d3.select("#bar-chart svg").remove();
    buildBarChart(filtered);
}

function renderTable(state) {
    const filtered = allData.filter(d => {
        const inTime = !state.selectedTime || (d.Date >= state.selectedTime[0] && d.Date <= state.selectedTime[1]);
        const inProd = !state.chosenCategory || d.Product === state.chosenCategory;
        return inTime && inProd;
    });
    d3.select("#data-table table").remove();
    d3.select("#pagination-controls").remove();
    buildTable(filtered);
}
