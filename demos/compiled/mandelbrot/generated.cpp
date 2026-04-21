#include <iostream>
#include <string>
#include <vector>

template<typename... Args>
void print(Args&&... args) {
    bool __first = true;
    ((std::cout << (__first ? "" : " ") << args, __first = false), ...);
    std::cout << std::endl;
}

template<typename T>
void __jspp_set(std::vector<T>& v, size_t i, T val) {
    if (i >= v.size()) v.resize(i + 1);
    v[i] = std::move(val);
}

template<typename T>
std::string __jspp_to_str(const T& v) { return std::to_string(v); }
inline std::string __jspp_to_str(const std::string& v) { return v; }
inline std::string __jspp_to_str(const char* v) { return std::string(v); }
template<typename A, typename B>
std::string __jspp_concat(const A& a, const B& b) { return __jspp_to_str(a) + __jspp_to_str(b); }

int mandel(double cx, double cy, int maxIter) {
    double x = 0;
    double y = 0;
    int i = 0;
    while ((i < maxIter)) {
        double x2 = (x * x);
        double y2 = (y * y);
        double r2 = (x2 + y2);
        if ((r2 > 4)) {
            return i;
        }
        double xt = ((x2 - y2) + cx);
        y = (((2 * x) * y) + cy);
        x = xt;
        i = (i + 1);
    }
    return maxIter;
}

int main() {
    int W = 96;
    int H = 64;
    int MAX_ITER = 80;
    print(W, H, MAX_ITER);
    double dx = (3 / W);
    double dy = (2.4 / H);
    int py = 0;
    while ((py < H)) {
        double cy = ((-1.2) + (dy * py));
        int px = 0;
        while ((px < W)) {
            double cx = ((-2.1) + (dx * px));
            int it = mandel(cx, cy, MAX_ITER);
            print(it);
            px = (px + 1);
        }
        py = (py + 1);
    }
    return 0;
}

