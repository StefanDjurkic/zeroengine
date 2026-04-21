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

int fibRecursive(int n) {
    if ((n <= 1)) {
        return n;
    }
    return (fibRecursive((n - 1)) + fibRecursive((n - 2)));
}

int fibIterative(int n) {
    int a = 0;
    int b = 1;
    for (auto i = 0; (i < n); (i++)) {
        auto temp = b;
        b = (a + b);
        a = temp;
    }
    return a;
}

int main() {
    (std::cout << std::string("Recursive fib(10):") << " " << fibRecursive(10) << std::endl);
    (std::cout << std::string("Iterative fib(10):") << " " << fibIterative(10) << std::endl);
    return 0;
}

